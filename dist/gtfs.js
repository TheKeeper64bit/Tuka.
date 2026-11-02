// One normalization contract for ZIP tables and the compact, lossless bus asset.
import {providerFor} from './city-providers.js?v=3';
export function seconds(value){if(!/^\d{1,3}:[0-5]\d:[0-5]\d$/.test(value||''))return NaN;return value.split(':').reduce((n,x)=>n*60+Number(x),0);}
const validStop=s=>s.stop_lat!==''&&s.stop_lon!==''&&Number.isFinite(+s.stop_lat)&&Number.isFinite(+s.stop_lon)&&Math.abs(+s.stop_lat)<=90&&Math.abs(+s.stop_lon)<=180;
export function geolocatedStops(rows){
 const index=new Map(rows.map(s=>[s.stop_id,s]));
 return rows.map(s=>{if(validStop(s))return s;let parent=s;const seen=new Set([s.stop_id]);
  while(parent.parent_station&&!seen.has(parent.parent_station)){seen.add(parent.parent_station);parent=index.get(parent.parent_station);if(!parent)break;if(validStop(parent))return {...s,stop_lat:parent.stop_lat,stop_lon:parent.stop_lon,stop_name:s.stop_name||parent.stop_name};}
  return s;
 }).filter(validStop);
}
const timeText=s=>Number.isFinite(s)?`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`:'';
function lru(map,key,value,limit){if(map.size>=limit)map.delete(map.keys().next().value);map.set(key,value);return value;}
export function normalizeGTFS(tables,cityId='skopje',compact=null,profile=null){
 const provider=profile||providerFor(cityId),f=name=>tables[name]||tables[name+'.txt']||[];
 for(const name of ['stops','routes','trips'])if(!f(name).length)throw Error(`GTFS missing ${name}.txt`);
 if(!f('calendar').length&&!f('calendar_dates').length)throw Error('GTFS has no service calendar');
 const zones=[...new Set(f('agency').map(x=>x.agency_timezone).filter(Boolean))];
 if(zones.length>1)throw Error('Multiple agency time zones need separate provider profiles');
 const timezone=zones[0]||provider.timezone;new Intl.DateTimeFormat('en',{timeZone:timezone});
 const stops=geolocatedStops(f('stops')).map(s=>({...s,id:s.stop_id,name:s.stop_name,lat:+s.stop_lat,lon:+s.stop_lon})),stopIndex=new Map(stops.map(s=>[s.id,s]));
 const routes=new Map(f('routes').map(r=>[r.route_id,r]));
 const trips=new Map(f('trips').filter(t=>routes.has(t.route_id)).map(t=>[t.trip_id,t]));
 const db={provider:provider.id,timezone,stops,stopIndex,routes,trips,calendar:f('calendar'),exceptions:f('calendar_dates'),transfers:f('transfers'),licenses:f('licenses'),info:f('feed_info')[0]||{},shapes:new Map(),times:new Map(),byStop:new Map(),maxSeconds:86400,tripBounds:new Map()};
 const index=new Map(),raw=new Map();
 if(compact){
  for(const [id,run] of Object.entries(compact.runs)){if(trips.has(id))raw.set(id,run);}
  db.shapes=new Map(Object.entries(compact.shapes));
 }else{
  for(const s of f('stop_times')){if(!trips.has(s.trip_id))continue;if(!raw.has(s.trip_id))raw.set(s.trip_id,[]);raw.get(s.trip_id).push({...s,seq:+s.stop_sequence,seconds:seconds(s.departure_time||s.arrival_time),arrivalSeconds:seconds(s.arrival_time||s.departure_time)});}
  for(const p of f('shapes')){if(!db.shapes.has(p.shape_id))db.shapes.set(p.shape_id,[]);db.shapes.get(p.shape_id).push([+p.shape_pt_lon,+p.shape_pt_lat,+p.shape_pt_sequence]);}
  for(const p of db.shapes.values())p.sort((a,b)=>a[2]-b[2]);
 }
 const expand=(id,run)=>compact?compact.patterns[run[0]].map(([stop_id,seq,a,d,pickup_type,drop_off_type])=>({trip_id:id,stop_id,seq,seconds:d===null?NaN:d+run[1],arrivalSeconds:a===null?NaN:a+run[1],pickup_type,drop_off_type,departure_time:timeText(d===null?NaN:d+run[1])})):run;
 // GTFS frequencies describe offsets from a template run, including >24h.
 if(!compact){
  let generated=0,frequencyCalls=0;
  for(const frequency of f('frequencies')){
   const trip=trips.get(frequency.trip_id),template=raw.get(frequency.trip_id),start=seconds(frequency.start_time),end=seconds(frequency.end_time),headway=Number(frequency.headway_secs);
   if(!trip||!template?.length||!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!Number.isInteger(headway)||headway<=0)throw Error('Invalid GTFS frequency window');
   template.sort((a,b)=>a.seq-b.seq);const first=template[0].seconds;
   if(!Number.isFinite(first))throw Error('Frequency template needs a departure time');
   for(let at=start;at<end;at+=headway){
    if(++generated>50000||(frequencyCalls+=template.length)>1000000)throw Error('Frequency expansion exceeds the browser import limit. Import a smaller network.');
    const id=frequency.trip_id+'~frequency~'+at;if(trips.has(id))throw Error('Duplicate frequency run');
    trips.set(id,{...trip,trip_id:id,frequencyEstimated:frequency.exact_times!=='1'});
    raw.set(id,template.map(p=>({...p,trip_id:id,seconds:p.seconds+at-first,arrivalSeconds:p.arrivalSeconds+at-first})));
   }
  }
  for(const row of f('frequencies')){trips.delete(row.trip_id);raw.delete(row.trip_id);}
 }
 const cache=new Map();
 for(const [id,run] of raw){
  const path=expand(id,run).sort((a,b)=>a.seq-b.seq);
  // Reject a broken trip as a whole; never join across a missing/invalid stop.
  if(path.length<2||path.some((s,i)=>!stopIndex.has(s.stop_id)||!Number.isInteger(s.seq)||s.seq<0||(i&&s.seq<=path[i-1].seq))){trips.delete(id);raw.delete(id);continue;}
  if(!compact){
   // Optional intermediate timepoints are interpolated, never omitted from geometry.
   let previous=-1;
   for(let i=0;i<path.length;i++)if(Number.isFinite(path[i].seconds)){
    if(previous>=0&&i>previous+1){const begin=path[previous].seconds,finish=path[i].arrivalSeconds;
     for(let j=previous+1;j<i;j++){const at=Math.round(begin+(finish-begin)*(path[j].seq-path[previous].seq)/(path[i].seq-path[previous].seq));path[j]={...path[j],seconds:at,arrivalSeconds:at,interpolated:true};}
    }previous=i;
   }
   if(!Number.isFinite(path[0].seconds)||!Number.isFinite(path.at(-1).seconds)||path.some((p,i)=>!Number.isFinite(p.seconds)||!Number.isFinite(p.arrivalSeconds)||p.arrivalSeconds>p.seconds||(i&&p.arrivalSeconds<path[i-1].seconds))){trips.delete(id);raw.delete(id);continue;}
   raw.set(id,path);
  }
  const timed=path.filter(s=>Number.isFinite(s.seconds));
  db.tripBounds.set(id,[timed[0]?.arrivalSeconds??NaN,timed.at(-1)?.seconds??NaN]);
  db.maxSeconds=Math.max(db.maxSeconds,...timed.map(s=>s.seconds));
  for(const sid of new Set(path.map(s=>s.stop_id))){if(!index.has(sid))index.set(sid,[]);index.get(sid).push(id);}
 }
 // Keep full timetable data, but materialize only recently queried trips/stops.
 db.times={size:raw.size,has:id=>raw.has(id),get(id){if(!raw.has(id))return;return cache.get(id)||lru(cache,id,expand(id,raw.get(id)),256);},*values(){for(const id of raw.keys())yield this.get(id);},*entries(){for(const id of raw.keys())yield [id,this.get(id)];},[Symbol.iterator](){return this.entries();}};
 for(const id of trips.keys())if(!raw.has(id))trips.delete(id);
 const stopCache=new Map();
 db.byStop={size:index.size,has:id=>index.has(id),keys:()=>index.keys(),get(id){if(!index.has(id))return;return stopCache.get(id)||lru(stopCache,id,index.get(id).flatMap(t=>db.times.get(t).filter(s=>s.stop_id===id)),24);}};
 return db;
}
export function cityStorage(storage,cityId='skopje'){
 const key=k=>cityId==='skopje'?k:`${k}:${cityId}`;
 return {getItem:k=>storage.getItem(key(k)),setItem:(k,v)=>storage.setItem(key(k),v)};
}
