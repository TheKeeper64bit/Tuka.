// OVapi's national feeds are filtered here, before being delivered to a browser.
import {fields,decodeRealtime} from '../dist/transit.js';
const first=(value,key)=>value[key]?.[0],text=bytes=>bytes?new TextDecoder().decode(bytes):'';
const privateResponse=r=>{const headers=new Headers(r.headers);headers.set('Cache-Control','private, max-age=30');return new Response(r.body,{status:r.status,headers});};
const SOURCES={trips:'tripUpdates',vehicles:'vehiclePositions',alerts:'alerts'};
function encodedField(key,bytes){let n=bytes.length,header=[key*8+2];do{const byte=n&127;n=Math.floor(n/128);header.push(byte|(n?128:0));}while(n);return new Uint8Array([...header,...bytes]);}
export function filterNetherlandsFeed(bytes,index){
 const root=fields(bytes),trips=new Set(index.tripIds),routes=new Set(index.routeIds),stops=new Set(index.stopIds),parts=[];
 if(first(root,1))parts.push(encodedField(1,first(root,1)));
 for(const raw of root[2]||[]){
  const entity=fields(raw);let keep=false;
  for(const key of [3,4]){const body=first(entity,key);if(!body)continue;const descriptor=first(fields(body),1);if(descriptor&&trips.has(text(first(fields(descriptor),1))))keep=true;}
  if(first(entity,5)){
   const alert=fields(first(entity,5));
   keep=(alert[5]||[]).some(rawSelector=>{const s=fields(rawSelector),trip=first(s,4)?fields(first(s,4)):{};return routes.has(text(first(s,2)))||stops.has(text(first(s,5)))||trips.has(text(first(trip,1)));});
  }
  if(keep)parts.push(encodedField(2,raw));
 }
 const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
}
async function boundedBytes(response,max=12000000){
 if(!response.ok||!response.body)throw Error('Source unavailable: '+response.status);
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('Feed too large');chunks.push(value);}}finally{await reader.cancel();}
 return new Uint8Array(await new Blob(chunks).arrayBuffer());
}
export async function netherlandsFeed(request,env,{fetcher=fetch}={}){
 const url=new URL(request.url),kind=url.pathname.split('/').at(-1);
 if(request.method!=='GET')return Response.json({error:'Read only'},{status:405});
 if(!SOURCES[kind]||url.search)return Response.json({error:'Unknown feed'},{status:400});
 try{
  const manifest=await env.ASSETS.fetch(new Request(new URL('/tilburg-index.json',url)));if(!manifest.ok)throw Error('Missing regional index');const index=await manifest.json();
  const key=new Request(new URL(`/internal/tilburg/${index.version}/${kind}`,url));
  const cache=globalThis.caches?.default,cached=await cache?.match(key);if(cached)return privateResponse(cached);
  const upstream=await fetcher(`https://gtfs.ovapi.nl/nl/${SOURCES[kind]}.pb`,{headers:{Accept:'application/x-protobuf'},cf:{cacheEverything:true,cacheTtl:30},signal:AbortSignal.timeout(12000)});
  const data=filterNetherlandsFeed(await boundedBytes(upstream),index);
  const response=new Response(data,{headers:{'Content-Type':'application/x-protobuf','Cache-Control':'public, max-age=30','X-Content-Type-Options':'nosniff'}});
  if(cache)await cache.put(key,response.clone());return privateResponse(response);
 }catch(error){console.warn('OVapi regional feed unavailable',kind,error.message);return Response.json({error:'Live OVapi data is unavailable. Scheduled trips remain available; this does not mean a cancellation.'},{status:503});}
}
export async function tilburgNotices(request,env,options={}){
 const feed=await netherlandsFeed(new Request(new URL('/api/transit/tilburg/alerts',request.url)),env,options);
 if(!feed.ok)return Response.json({articles:[],unavailable:true,error:'Operator notices are temporarily unavailable.',sourceUrl:'https://www.bravo.info/reizen/omleidingen-en-storingen-bus'},{status:503});
 const decoded=decodeRealtime(new Uint8Array(await feed.arrayBuffer()),'OVapi'),now=Date.now()/1000;
 if(!Number.isFinite(decoded.timestamp)||now-decoded.timestamp>600||decoded.timestamp>now+15)return Response.json({articles:[],unavailable:true,error:'The operator notice feed is out of date.'},{status:503});
 // The publication date is not supplied by GTFS-RT. Never substitute the fetch date.
 const translated=values=>(values?.find(v=>v.language==='en')||values?.find(v=>v.language==='nl')||values?.[0])?.text||'';
 const seen=new Set(),articles=[];
 for(const a of decoded.alerts){
  if(a.periods.length&&a.periods.every(p=>p.end&&p.end<=now))continue;
  const title=translated(a.title),description=translated(a.description);if(!title||seen.has(title+'|'+description))continue;seen.add(title+'|'+description);
  const candidate=translated(a.url);let sourceUrl='https://www.bravo.info/reizen/omleidingen-en-storingen-bus';
  try{const u=new URL(candidate);if(u.protocol==='https:'&&['www.arriva.nl','arriva.nl','www.bravo.info','bravo.info'].includes(u.hostname)&&!u.username&&!u.password&&!u.port)sourceUrl=u.href;}catch{}
  articles.push({title,summary:description.slice(0,400),paragraphs:[description||title],publishedAt:null,sourceUrl,aiEdited:false,kind:'operator-notice',periods:a.periods,selectors:a.selectors});
 }
 return Response.json({articles:articles.slice(0,60),checkedAt:new Date(decoded.timestamp*1000).toISOString(),sourceUrl:'https://www.bravo.info/reizen/omleidingen-en-storingen-bus'},{headers:{'Cache-Control':'private, max-age=30'}});
}
