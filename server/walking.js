import {distance} from '../dist/schedule.js';

function point(value){const parts=(value||'').split(',');if(parts.length!==2||parts.some(s=>!s.trim()))return null;const [lon,lat]=parts.map(Number);return Number.isFinite(lon)&&Number.isFinite(lat)&&lon>=21.2&&lon<=21.65&&lat>=41.8&&lat<=42.2?{lon,lat}:null;}
export function normalizeWalk(data,from,to){
  const route=data?.routes?.[0],coordinates=route?.geometry?.coordinates;
  if(data?.code!=='Ok'||!Array.isArray(coordinates)||coordinates.length<2||coordinates.length>10000||!Number.isFinite(route.distance)||route.distance<0||route.distance>15000)throw Error('No walking route');
  if(coordinates.some(p=>!Array.isArray(p)||p.length!==2||!point(p.join(','))))throw Error('Invalid path');
  const at=p=>({lon:p[0],lat:p[1]}),startGap=distance(from,at(coordinates[0])),endGap=distance(to,at(coordinates.at(-1)));
  if(startGap>40||endGap>40)throw Error('Walking endpoint too far from path');
  const steps=(route.legs||[]).flatMap(l=>l.steps||[]);
  if(!steps.length||steps.some(s=>s.mode!=='walking'))throw Error('Not a pedestrian route');
  return {coordinates,distance:Math.ceil(route.distance+startGap+endGap),startGap:Math.ceil(startGap),endGap:Math.ceil(endGap),steps:steps.slice(0,100).map(s=>({name:String(s.name||'').slice(0,150),distance:Math.round(s.distance||0),type:String(s.maneuver?.type||'continue').slice(0,40),modifier:String(s.maneuver?.modifier||'').slice(0,40)}))};
}
async function boundedJSON(response){
  const reader=response.body.getReader();let size=0,parts=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>512000)throw Error('Route response too large');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
  return JSON.parse(await new Blob(parts).text());
}
export async function walkingResponse(request,env,{fetcher=fetch,now=Date.now()}={}){
  if(request.method!=='GET')return Response.json({error:'Method not allowed'},{status:405});
  const url=new URL(request.url),from=point(url.searchParams.get('from')),to=point(url.searchParams.get('to'));
  if(!from||!to||distance(from,to)>2500)return Response.json({error:'Choose nearby points in Skopje.'},{status:400});
  const pair=p=>`${p.lon.toFixed(5)},${p.lat.toFixed(5)}`,key=`${pair(from)};${pair(to)}`;
  try{
    const cached=await env.AUTH_DB.prepare('SELECT payload FROM walking_cache WHERE route_key = ? AND expires_at > ?').bind(key,now).first();
    if(cached)return Response.json(JSON.parse(cached.payload));
    // One shared, atomic budget across isolates: <= 1 request/sec and a small
    // daily cap for this community demo. Cache hits use no provider quota.
    const day=new Date(now).toISOString().slice(0,10);
    const claim=await env.AUTH_DB.prepare('UPDATE walking_budget SET next_at = ?, day = ?, requests = CASE WHEN day = ? THEN requests + 1 ELSE 1 END WHERE id = 1 AND next_at <= ? AND (day != ? OR requests < 500) RETURNING id').bind(now+1200,day,day,now,day).first();
    if(!claim)return Response.json({error:'Walking directions are busy. Approximate paths remain available.'},{status:429,headers:{'Retry-After':'2'}});
    const response=await fetcher(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${key}?overview=full&geometries=geojson&steps=true`,{headers:{'User-Agent':'Tuka/1.0 (+https://tuka.rand0m.net)'},signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Walking provider unavailable');
    const result=normalizeWalk(await boundedJSON(response),from,to);
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare('DELETE FROM walking_cache WHERE expires_at < ?').bind(now),
      env.AUTH_DB.prepare('INSERT OR REPLACE INTO walking_cache (route_key,payload,expires_at) VALUES (?,?,?)').bind(key,JSON.stringify(result),now+86400000)
    ]);
    return Response.json(result);
  }catch{return Response.json({error:'Street walking directions are unavailable. Use the approximate path.'},{status:503});}
}
