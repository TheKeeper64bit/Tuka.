import {REALTIME_SOURCES} from '../server/transit-provider.js';
// Runs the same parser, geometry validator and matching code used by the app.
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {parseGTFSZip,decodeRealtime,normalizeRealtime,departures} from '../dist/transit.js';
import {normalizeGTFS} from '../dist/gtfs.js';
import {routeGeometry} from '../dist/map-ui.js';
import {active,serviceDay,localTimestamp} from '../dist/schedule.js';
import {providerFor} from '../dist/city-providers.js';
const [city,source,output,date='2026-10-29',stop='1']=process.argv.slice(2);
if(!city||!source||!output)throw Error('Usage: node scripts/diagnose-transit.mjs CITY FEED.zip|NETWORK.bin OUTPUT.json [DATE] [STOP]');
const bytes=readFileSync(source),compact=source.endsWith('.bin')?JSON.parse(gunzipSync(bytes)):null;
const tables=compact?.tables||await parseGTFSZip(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const rows=name=>tables[name]||tables[name+'.txt']||[];
const db=normalizeGTFS(tables,city,compact),trips=new Map(rows('trips').map(t=>[t.trip_id,t])),stops=new Map(rows('stops').map(s=>[s.stop_id,s]));
let stopTimes=0,missingTrip=0,missingStop=0,invalidTimes=0,unordered=0;
const sizes=new Map();
const rawCalls=compact?function*(){for(const [trip_id,[pattern,start]]of Object.entries(compact.runs))for(const [stop_id,stop_sequence,a,d] of compact.patterns[pattern])yield {trip_id,stop_id,stop_sequence,arrival_time:a,departure_time:d};}():rows('stop_times');
const previous=new Map();
for(const s of rawCalls){stopTimes++;if(!trips.has(s.trip_id))missingTrip++;if(!stops.has(s.stop_id))missingStop++;sizes.set(s.trip_id,(sizes.get(s.trip_id)||0)+1);if(Number(s.stop_sequence)<(previous.get(s.trip_id)??-1))unordered++;previous.set(s.trip_id,Number(s.stop_sequence));if(s.departure_time===null||s.departure_time==='')invalidTimes++;}
const tested=new Map();let approximate=0,published=0;
for(const trip of db.trips.values()){
 const path=db.times.get(trip.trip_id),key=JSON.stringify([trip.shape_id,path.map(s=>s.stop_id)]);
 if(!tested.has(key))tested.set(key,routeGeometry(db,trip));
 const geometry=tested.get(key);geometry.approximate?approximate++:published++;
}
const provider=providerFor(city),urls=REALTIME_SOURCES[city]?Object.values(REALTIME_SOURCES[city]):[provider.realtime.url];
const realtime=await Promise.all(urls.map(async url=>{
 try{const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)return {url,status:response.status};
 const raw=decodeRealtime(new Uint8Array(await response.arrayBuffer()),provider.label),now=Date.now(),matched=normalizeRealtime(raw,db,now);
 const ids=new Set([...raw.updates.keys()].map(k=>k.split('|')[0]).concat(raw.vehicles.map(v=>v.tripId)));
 return {url,status:response.status,timestamp:raw.timestamp,ageSeconds:Math.round(now/1000-raw.timestamp),fresh:matched.timestamp>0,providerTripIds:ids.size,matchedTripIds:[...ids].filter(id=>db.trips.has(id)).length,unmatchedTripIds:[...ids].filter(id=>!db.trips.has(id)).length,rawVehicles:raw.vehicles.length,usableVehicles:matched.vehicles.length,rawUpdates:raw.updates.size,usableUpdates:matched.updates.size};
 }catch(error){return {url,available:false,error:error.name};}
}));
const day=serviceDay(0,date,db.timezone),time=localTimestamp(date,'00:00',db.timezone);
const calls=departures(db,null,stop,time,10000,{horizonHours:24});
const required=['agency','stops','routes','trips','stop_times'];
const report={generatedAt:new Date().toISOString(),city,source:compact?.source||provider.gtfsUrl,sha256:compact?.sha256||createHash('sha256').update(bytes).digest('hex'),selectedDate:date,selectedStop:stop,timezone:db.timezone,requiredFiles:Object.fromEntries(required.map(n=>[n+'.txt',compact&&n==='stop_times'?true:rows(n).length>0])),optionalFiles:{'shapes.txt':db.shapes.size>0,'calendar.txt':rows('calendar').length>0,'calendar_dates.txt':rows('calendar_dates').length>0},hasServiceCalendar:db.calendar.length>0||db.exceptions.length>0,counts:{stops:stops.size,routes:rows('routes').length,trips:trips.size,usableTrips:db.trips.size,stopTimes,shapes:db.shapes.size},relationships:{missingTripReferences:missingTrip,missingStopReferences:missingStop,missingRouteReferences:rows('trips').filter(t=>!db.routes.has(t.route_id)).length,invalidStopCoordinates:stops.size-db.stops.length,tripsWithFewerThanTwoCalls:[...trips.keys()].filter(id=>(sizes.get(id)||0)<2).length,rejectedTrips:[...trips.keys()].filter(id=>!db.trips.has(id)),untimedCalls:invalidTimes,rowsOutOfSequenceBeforeNormalization:unordered},geometry:{uniqueTripPatterns:tested.size,publishedShapeTrips:published,approximateTrips:approximate,rejectedPatterns:[...tested].filter(([,g])=>g.reason==='invalid-shape').length,missingShapePatterns:[...tested].filter(([,g])=>g.reason==='missing-shape').length},activeServiceIds:[...active(db,day)],selectedStopDepartures:{count:calls.length,sample:calls.slice(0,8).map(r=>({tripId:r.trip.trip_id,routeId:r.trip.route_id,serviceDate:r.day.date,departure:new Date(r.time).toISOString(),live:r.live}))},realtime};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,counts:report.counts,geometry:report.geometry,departures:calls.length,realtime},null,2));
