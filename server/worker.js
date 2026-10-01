// Only fixed public transport endpoints are proxied. No user location is sent upstream.
const UPSTREAM = 'http://info.skopska.mk:8080/';
let session, sessionUntil = 0, sessionPending;
const memory = new Map(), pending = new Map();
async function cached(key, ttl, read) {
  const old = memory.get(key);
  if (old && Date.now() < old.until) return old.value;
  if (pending.has(key)) return pending.get(key);
  const promise = read().then(value => {
    memory.set(key, {value, until:Date.now()+ttl});
    if (memory.size > 120) memory.delete(memory.keys().next().value);
    return value;
  }).finally(()=>pending.delete(key));
  pending.set(key,promise); return promise;
}
async function guest() {
  if(session && Date.now()<sessionUntil) return session;
  if(sessionPending) return sessionPending;
  sessionPending=(async()=>{
    const r=await fetch(UPSTREAM+'rest-auth/guests?aid=3136',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(10000)});
    if(!r.ok) throw Error('Public transport session unavailable');
    const value=await r.json();
    if(typeof value!=='string'||!value)throw Error('Invalid public transport session');
    session=value;sessionUntil=Date.now()+20*60000;return session;
  })().finally(()=>sessionPending=null);return sessionPending;
}
async function read(path) {
  const sid=await guest();
  const r=await fetch(UPSTREAM+path,{headers:{'eurogps.eu.sid':sid},signal:AbortSignal.timeout(10000)});
  if(!r.ok){if([400,401,403].includes(r.status))sessionUntil=0;throw Error('Transport source unavailable');}
  const data=await r.json();if(!Array.isArray(data))throw Error('Invalid transport data');return data;
}
const network=()=>cached('network',3600000,async()=>{
  const [lines,routes,stops,courses,vehicles]=await Promise.all([
    read('rest-its/scheme/lines'),read('rest-its/scheme/routes'),read('rest-its/scheme/stops'),read('rest-its/scheme/courses'),read('rest-avl/fundamentals/vehicles')]);
  return {lines:lines.map(x=>({id:x.id,number:x.number})),routes:routes.map(x=>({id:x.id,lineId:x.lineId,direction:x.direction,stopIds:x.stopIds})),stops:stops.map(x=>({id:x.id,code:x.number,lat:x.lat,lon:x.lon})),courses:new Map(courses.map(x=>[x.id,{routeId:x.routeId,start:x.time}])),labels:new Map(vehicles.map(x=>[x.id,x.display||x.name]))};
});
async function live(){return cached('live',10000,async()=>{
  const [n,positions,statuses]=await Promise.all([network(),read('rest-avl/rtpi/positions'),read('rest-its/rtpi/vehicle-statuses')]);
  const now=Date.now()/1000,status=new Map(statuses.map(x=>[x.vehicleId,x]));
  const vehicles=[];
  for(const p of positions){
    const s=status.get(p.vehicleId),c=n.courses.get(s?.courseId);
    // Pause/join/wait/off-duty assignments can retain an old course; exclude them.
    if(!s||s.status!=='COURSE_EXECUTE'||!c||now-p.time>120||p.time>now+15||now-s.date>120||s.date>now+15)continue;
    if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||p.lat<41.5||p.lat>42.6||p.lon<20.7||p.lon>22)continue;
    vehicles.push({id:'sk-'+p.vehicleId,label:n.labels.get(p.vehicleId)||String(p.vehicleId),routeId:c.routeId,start:c.start,lat:p.lat,lon:p.lon,timestamp:p.time,statusTimestamp:s.date,seq:Number.isInteger(s.stopIndex)?s.stopIndex+1:null,delay:Number.isFinite(s.delay)&&Math.abs(s.delay)<=7200?s.delay:null});
  }
  return {timestamp:Math.floor(now),vehicles};
});}
async function arrivals(code){return cached('arrivals-'+code,10000,async()=>{
  const n=await network(),matches=n.stops.filter(x=>x.code===code);
  if(matches.length!==1)return {timestamp:Math.floor(Date.now()/1000),arrivals:[]};
  const data=await read('rest-its/scheme/stop-lines/'+matches[0].id),timestamp=Math.floor(Date.now()/1000);
  return {timestamp,stopId:matches[0].id,arrivals:data.flatMap(x=>(x.remainingTime||[]).filter(t=>Number.isFinite(t)&&t>=0&&t<=14400).map(t=>({routeId:x.routeId,time:timestamp+t})))};
});}
export default {async fetch(request){
  const u=new URL(request.url);
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  if(u.pathname.startsWith('/api/')){
    try{
      let data;
      if(u.pathname==='/api/network'){const n=await network();data={lines:n.lines,routes:n.routes,stops:n.stops};}
      else if(u.pathname==='/api/live')data=await live();
      else if(u.pathname==='/api/arrivals'&&/^\d{1,5}$/.test(u.searchParams.get('stop')||''))data=await arrivals(u.searchParams.get('stop'));
      else return new Response('Not found',{status:404});
      return Response.json(data,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }catch{return Response.json({error:'Additional live source temporarily unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
  }
  const path=u.pathname==='/'?'/index.html':u.pathname,asset=STATIC[path];
  if(!asset)return new Response('Not found',{status:404});
  const bytes=Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));
  return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':asset.type,'Cache-Control':path==='/sw.js'||path==='/index.html'?'no-cache':'public, max-age=3600','X-Content-Type-Options':'nosniff'}});
}};
