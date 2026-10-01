// Conservative Skopska supplement. Timetables are never used to invent GPS positions.
const letters={'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Ѓ':'Gj','Е':'E','Ж':'Zh','З':'Z','Ѕ':'Dz','И':'I','Ј':'J','К':'K','Л':'L','Љ':'Lj','М':'M','Н':'N','Њ':'Nj','О':'O','П':'P','Р':'R','С':'S','Т':'T','Ќ':'Kj','У':'U','Ф':'F','Х':'H','Ц':'C','Ч':'Ch','Џ':'Dzh','Ш':'Sh'};
const norm=s=>String(s??'').toUpperCase().split('').map(c=>letters[c]||c).join('').replace(/[^A-Z0-9]/g,'');
const meters=(a,b)=>Math.hypot((a.lat-b.lat)*111000,(a.lon-b.lon)*82500);
function pathDistance(v,path){let best=Infinity;for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],x=(b.lon-a.lon)*82500,y=(b.lat-a.lat)*111000,px=(v.lon-a.lon)*82500,py=(v.lat-a.lat)*111000,t=Math.max(0,Math.min(1,(px*x+py*y)/(x*x+y*y||1)));best=Math.min(best,Math.hypot(px-t*x,py-t*y));}return best;}
let networkPromise,networkUntil=0;
async function json(path){const r=await fetch(new URL(path,globalThis.location?.href||'http://localhost/'),{cache:'no-store',signal:AbortSignal.timeout(24000)});if(!r.ok)throw Error('Additional source unavailable');return r.json();}
function network(){if(!networkPromise||Date.now()>networkUntil){networkUntil=Date.now()+3600000;networkPromise=json('./api/network').catch(e=>{networkPromise=null;throw e;});}return networkPromise;}
export async function additional(stopCode){
  const [n,l,a]=await Promise.allSettled([network(),json('./api/live'),stopCode?json('./api/arrivals?stop='+encodeURIComponent(stopCode)):Promise.resolve(null)]);
  if(n.status!=='fulfilled')throw Error('Additional network unavailable');
  if(l.status!=='fulfilled'&&(!stopCode||a.status!=='fulfilled'))throw Error('Additional live source unavailable');
  return {network:n.value,live:l.status==='fulfilled'?l.value:null,arrivals:a.status==='fulfilled'?a.value:null};
}
export function mergeAdditional(db,rt,data,day,services,now=Date.now()/1000){
  if(!db||!data)return rt;
  const n=data.network,stopsByCode=new Map(),lineByNumber=new Map(),skLines=new Map(n.lines.map(x=>[x.id,x.number])),mappedStops=new Map(),paths=new Map();
  for(const s of db.stops){const k=String(s.stop_code);if(!stopsByCode.has(k))stopsByCode.set(k,[]);stopsByCode.get(k).push(s);}
  for(const r of db.routes.values()){const k=norm(r.route_short_name);if(!lineByNumber.has(k))lineByNumber.set(k,[]);lineByNumber.get(k).push(r);}
  for(const s of n.stops){const matches=(stopsByCode.get(String(s.code))||[]).filter(x=>meters(x,s)<100);if(matches.length===1)mappedStops.set(s.id,matches[0]);}
  for(const r of n.routes){const matches=lineByNumber.get(norm(skLines.get(r.lineId)))||[],path=(r.stopIds||[]).map(id=>mappedStops.get(id));if(matches.length!==1||path.length<2||path.some(x=>!x))continue;paths.set(r.id,{route:matches[0],headsign:r.direction,path});}
  // The main feed wins conflicts. Suppress stale duplicates only after validating the supplement.
  rt.vehicles=rt.vehicles.filter(v=>now-v.timestamp<=120&&v.timestamp<=now+15);
  const seen=new Set(rt.vehicles.map(v=>v.label).filter(Boolean));
  const freshLive=data.live&&now-data.live.timestamp<=120&&data.live.timestamp<=now+15;
  if(freshLive)for(const v of data.live.vehicles||[]){
    const p=paths.get(v.routeId);
    if(!p||seen.has(v.label)||now-v.timestamp>120||v.timestamp>now+15||!Number.isInteger(v.seq)||v.seq<1||v.seq>p.path.length||pathDistance(v,p.path)>350)continue;
    const candidates=[...db.trips.values()].filter(t=>t.route_id===p.route.route_id&&services.has(t.service_id)).filter(t=>{const times=db.times.get(t.trip_id)||[];return Math.abs((times[0]?.seconds??-999999)-v.start)<=60&&times.length===p.path.length&&times.every((s,i)=>s.stop_id===p.path[i].id);});
    const trip=candidates.length===1?candidates[0]:null;
    const matchedTimes=trip?db.times.get(trip.trip_id):null;
    const seq=matchedTimes?matchedTimes[v.seq-1].seq:v.seq;
    const vehicle={...v,routeId:p.route.route_id,tripId:trip?.trip_id||null,date:day.date,seq,headsign:p.headsign,source:'Skopska',stops:p.path.map((s,i)=>({id:s.id,seq:matchedTimes?.[i]?.seq??i+1}))};
    rt.vehicles.push(vehicle);seen.add(v.label);
    // Use delay for routing only with one exact active trip and matching complete stop pattern.
    if(trip&&Number.isFinite(v.delay)&&Math.abs(v.delay)<=7200&&Math.abs(v.timestamp-v.statusTimestamp)<=30){for(const s of matchedTimes.filter(s=>s.seq>=seq)){const key=trip.trip_id+'|'+s.stop_id+'|'+day.date;if(!rt.updates.has(key))rt.updates.set(key,{delay:v.delay,seq:s.seq,source:'Skopska'});}}
  }
  const a=data.arrivals;rt.additionalArrivals=[];
  if(a&&now-a.timestamp<=120&&a.timestamp<=now+15){const stop=mappedStops.get(a.stopId);if(stop)for(const x of a.arrivals||[]){const p=paths.get(x.routeId),index=p?.path.findIndex(s=>s.id===stop.id);if(!p||index<0||!Number.isFinite(x.time)||x.time<now-20||x.time>now+14400)continue;rt.additionalArrivals.push({stopId:stop.id,route:p.route,headsign:p.headsign,time:x.time*1000,timestamp:a.timestamp,seq:index+1,path:p.path.map(s=>s.id)});}}
  if(freshLive&&rt.vehicles.some(v=>v.source==='Skopska')||rt.additionalArrivals.length)rt.timestamp=Math.max(rt.timestamp||0,data.live?.timestamp||0,a?.timestamp||0);
  rt.sources={modeshift:!!rt.modeshift,skopska:!!freshLive};return rt;
}
export function mergeArrivals(db,rt,id,list,now,day){
  const extra=(rt?.additionalArrivals||[]).filter(x=>x.stopId===id&&now/1000-x.timestamp<=120&&x.time>=now-20000&&x.time<=now+14400000);
  if(!extra.length)return list;
  const out=[...list],used=new Set();
  for(const a of extra){
    const same=out.filter(x=>!used.has(x)&&x.trip.route_id===a.route.route_id&&((db.times.get(x.trip.trip_id)||[]).map(s=>s.stop_id).join('|')===a.path.join('|')||norm(x.trip.trip_headsign)===norm(a.headsign)));
    // Similar live predictions describe one arrival. Keep the main feed's prediction.
    const live=same.find(x=>x.live&&Math.abs(x.time-a.time)<=180000);
    if(live){used.add(live);continue;}
    const scheduled=same.filter(x=>!x.live).sort((x,y)=>Math.abs(x.time-a.time)-Math.abs(y.time-a.time))[0];
    if(scheduled&&Math.abs(scheduled.time-a.time)<=600000){out.splice(out.indexOf(scheduled),1);}
    const entry={trip:{trip_id:'sk-eta-'+a.route.route_id+'-'+a.time,route_id:a.route.route_id,trip_headsign:a.headsign},s:{seq:a.seq,stop_id:id},route:a.route,time:a.time,scheduled:null,live:true,source:'Skopska',day,unmatched:true};out.push(entry);used.add(entry);
  }
  return out.sort((a,b)=>a.time-b.time);
}
