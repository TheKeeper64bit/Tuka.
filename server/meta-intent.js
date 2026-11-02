import {journeyCompletion,modelProviders} from './model-provider.js';
import {CITY_PROVIDERS} from '../dist/city-providers.js';
import {localDate,localTimestamp} from '../dist/schedule.js';
export function validateIntent(value,cityId,now=Date.now()){
 if(!Object.hasOwn(CITY_PROVIDERS,cityId)||!value||typeof value!=='object')throw Error('Invalid city or request');
 const allowed=['origin','destination','mode','date','time','maxWalkingMinutes','preference'];
 if(Object.keys(value).some(k=>!allowed.includes(k)))throw Error('Unsupported travel constraint');
 const place=(v,optional=false)=>{if(optional&&v===null)return null;if(typeof v!=='string'||!v.trim()||v.length>160)throw Error('A place name is required');return v.trim();};
 const origin=place(value.origin,true),destination=place(value.destination);
 if(!['now','leave','arrive'].includes(value.mode)||!['fastest','transfers','walking'].includes(value.preference))throw Error('Invalid planning preference');
 const walk=value.maxWalkingMinutes;if(walk!==null&&(!Number.isInteger(walk)||walk<1||walk>120))throw Error('Walking limit must be 1–120 minutes');
 let date=null,time=null;
 if(value.mode!=='now'){
  date=value.date;time=value.time;if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||''))throw Error('Choose a date and time');
  const timestamp=localTimestamp(date,time,CITY_PROVIDERS[cityId].timezone);
  if(!Number.isFinite(timestamp)||timestamp<now-60000||timestamp>now+90*86400000)throw Error('Choose a valid future date within 90 days');
 }
 return {origin,destination,mode:value.mode,date,time,maxWalkingMinutes:walk,preference:value.preference};
}
export async function interpretJourney(request,env,{fetcher=fetch,now=Date.now()}={}){
 const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(request.method!=='POST')return json({error:'Use POST'},405);
 const reader=request.body?.getReader(),chunks=[];let size=0;
 if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>6000)return json({error:'Request too large'},413);chunks.push(value);}}finally{await reader.cancel();}}
 const text=await new Blob(chunks).text();
 let input;try{input=JSON.parse(text);}catch{return json({error:'Invalid request'},400);}
 if(!input||typeof input!=='object'||Array.isArray(input)||!Object.hasOwn(CITY_PROVIDERS,input.cityId)||typeof input.message!=='string'||!input.message.trim()||input.message.length>1200)return json({error:'Choose a city and enter a travel request.'},400);
 if(!modelProviders(env).length)return json({error:'Meta interpretation is not configured. Use the journey planner fields.'},503);
 const provider=CITY_PROVIDERS[input.cityId];
 const tool={type:'function',function:{name:'plan_transit_journey',description:'Extract travel preferences only. Never supply route IDs, trips, coordinates or departure predictions.',parameters:{type:'object',additionalProperties:false,properties:{origin:{type:['string','null'],description:'Place name the rider gave; null means current location.'},destination:{type:'string'},mode:{type:'string',enum:['now','leave','arrive']},date:{type:['string','null'],description:'YYYY-MM-DD in the city time zone; null for now.'},time:{type:['string','null'],description:'HH:MM city-local time; null for now.'},maxWalkingMinutes:{type:['integer','null'],description:'Maximum total walking minutes; null when unspecified.'},preference:{type:'string',enum:['fastest','transfers','walking']}},required:['origin','destination','mode','date','time','maxWalkingMinutes','preference']}}};
 try{
  const {response:r,provider:modelProvider}=await journeyCompletion(env,{model:env.META_MODEL||'muse-spark-1.3',temperature:0,max_completion_tokens:500,parallel_tool_calls:false,tool_choice:{type:'function',function:{name:'plan_transit_journey'}},tools:[tool],messages:[{role:'system',content:`Extract only the user's stated journey constraints for ${provider.name}. Today is ${localDate(now,provider.timezone)}; current local time is ${new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:provider.timezone}).format(now)} (${provider.timezone}). Resolve tomorrow/date expressions in this zone. If a time today has passed, use the next day only when no date was explicitly specified. Use fastest and now if unspecified. Do not infer locations that were not requested. Do not answer with itineraries or transport facts. Use the tool.`},{role:'user',content:input.message}]},{fetcher});
  if(!r.ok)return json({error:'Meta interpretation is unavailable. Use the planner fields.'},r.status===429?429:502);
  const data=await r.json(),calls=data.choices?.[0]?.message?.tool_calls;
  if(calls?.length!==1||calls[0].function?.name!=='plan_transit_journey')throw Error('Please specify a start, destination and travel time.');
  const intent=validateIntent(JSON.parse(calls[0].function.arguments),input.cityId,now);
  return json({cityId:input.cityId,intent,timezone:provider.timezone,provider:modelProvider});
 }catch(error){return json({error:error.name==='SyntaxError'?'Could not interpret the request. Use the planner fields.':error.name==='TimeoutError'?'Meta took too long. Use the planner fields.':'Could not interpret the request. Check the places and travel time or use the planner fields.'},error.status===502?502:422);}
}
