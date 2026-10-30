import {sharedJourney,readShared,writePlace,readPlaces} from '../dist/journey-tools.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeGTFS,cityStorage} from '../dist/gtfs.js';
import {departures,normalizeRealtime,decodeRealtime} from '../dist/transit.js';
import {planJourney} from '../dist/planner.js';
import {localTimestamp,localDate,prediction,serviceDay} from '../dist/schedule.js';
import {routeGeometry,resolveRouteGeometry} from '../dist/map-ui.js';
import {boardingNetwork,visibleNetwork} from '../dist/stop-network.js';
import {transitFeed,roadGeometry} from '../server/transit-provider.js';
const fixture=city=>JSON.parse(readFileSync(new URL(`./fixtures/${city}-gtfs.json`,import.meta.url)));
for(const city of ['skopje','boston']){
 test(`${city}: preserves IDs, orders directions, static departures and journeys`,()=>{
  const db=normalizeGTFS(fixture(city),city),p=city==='boston'?'B:':'SK-',out=db.trips.get(p+'out'),back=db.trips.get(p+'back');
  assert.equal(db.times.get(out.trip_id)[0].stop_id,p+'000');
  assert.equal(db.times.get(back.trip_id)[0].stop_id,p+'002');
  const go=routeGeometry(db,out),reverse=routeGeometry(db,back);
  assert.deepEqual(go.points.at(-1),reverse.points[0]);assert.deepEqual(reverse.points.at(-1),go.points[0]);
  assert.equal(reverse.approximate,city==='boston');
  const network=boardingNetwork(db,p+'001');
  assert(network.reachable.has(p+'000'));assert(network.reachable.has(p+'002'));
  for(const pattern of network.patterns)assert.deepEqual(pattern.points[0],[db.stops[1].lon,db.stops[1].lat]);
  const time=localTimestamp('2026-10-29','07:55',db.timezone);
  const rows=departures(db,null,p+'000',time);assert.equal(rows[0].trip.trip_id,p+'out');assert.equal(rows[0].live,false);
  const journey=planJourney(db,null,db.stops[0],db.stops[2],time,{mode:'leave'}).find(r=>r.legs.some(l=>l.type==='bus'));
  assert(journey);assert.equal(journey.legs.find(l=>l.type==='bus').tripId,p+'out');
  assert(journey.legs.every(l=>!l.live));
  const deadline=localTimestamp('2026-10-29','08:25',db.timezone);
  const arrive=planJourney(db,null,db.stops[0],db.stops[2],deadline,{mode:'arrive'});assert(arrive.length);assert(arrive.every(r=>r.arrival<=deadline));
 });
 test(`${city}: calendar exceptions and 24-hour-plus times use agency date`,()=>{
  const db=normalizeGTFS(fixture(city),city),p=city==='boston'?'B:':'SK-';
  const time=localTimestamp('2026-10-30','00:05',db.timezone),rows=departures(db,null,p+'000',time);
  assert.equal(rows[0].trip.trip_id,p+'night');assert.equal(rows[0].day.date,'20261029');
  assert.equal(rows[0].time,localTimestamp('2026-10-30','00:10',db.timezone));
  assert.equal(departures(db,null,p+'000',localTimestamp('2026-10-30','07:55',db.timezone)).length,0);
 });
}
test('invalid/reversed shapes and broken stop references never invent connecting geometry',async()=>{
 const data=fixture('boston'),db=normalizeGTFS(data,'boston'),trip=db.trips.get('B:out');
 db.shapes.set(trip.shape_id,db.shapes.get(trip.shape_id).slice().reverse());assert(routeGeometry(db,trip).approximate);
 const good=routeGeometry(db,trip).points;
 let attempts=0;const road=await resolveRouteGeometry(db,trip,async()=>{attempts++;return Response.json({points:good});});assert.equal(road.kind,'road');assert(road.approximate);
 await resolveRouteGeometry(db,trip,async()=>{throw Error();});assert.equal(attempts,1);
 const missing=normalizeGTFS(fixture('boston'),'boston');const fallback=await resolveRouteGeometry(missing,missing.trips.get('B:back'),async()=>{throw Error('offline');});assert(fallback.approximate);assert.equal(fallback.kind,undefined);
 data.stops[1].stop_lon='invalid';const broken=normalizeGTFS(data,'boston');assert.equal(broken.trips.size,0);
});
test('DST gaps, overlaps and simultaneous city prediction caches remain independent',()=>{
 const zone='America/New_York';assert(Number.isNaN(localTimestamp('2026-03-08','02:30',zone)));
 assert.equal(localTimestamp('2026-11-01','01:30',zone),Date.parse('2026-11-01T05:30:00Z'));
 assert(Number.isNaN(localTimestamp('2026-13-01','08:00',zone)));
 const now=Date.parse('2026-10-30T01:00:00Z'),update={delay:60},rt={timestamp:now/1000,updates:new Map([['trip|stop|',update]])};
 for(const z of ['Europe/Skopje',zone,'Europe/Skopje'])assert.equal(prediction(rt,'trip','stop',serviceDay(0,now,z),now,now,z),update);
});
test('fresh predictions match exact sequence; stale/unknown/wrong-route vehicles are discarded',()=>{
 const db=normalizeGTFS(fixture('boston'),'boston'),now=localTimestamp('2026-10-29','08:00',db.timezone),day=serviceDay(0,now,db.timezone);
 const update={departure:{delay:120},seq:11};
 const v={id:'v',tripId:'B:out',routeId:'B:route',stopId:'B:001',seq:11,date:day.date,lat:42.35,lon:-71.075,timestamp:now/1000};
 const feed={timestamp:now/1000,updates:new Map([['B:out|B:001|20261029|11',update],['unknown|B:001|20261029|11',update]]),vehicles:[v,{...v,tripId:'unknown'},{...v,timestamp:now/1000-121},{...v,routeId:'wrong'}],alerts:[]};
 const rt=normalizeRealtime(feed,db,now);assert.equal(rt.vehicles.length,1);assert.equal(rt.updates.size,1);
 assert.equal(prediction(rt,'B:out','B:001',day,now,now,db.timezone,11).departure.delay,120);
 assert.equal(prediction(rt,'B:out','B:001',day,now,now,db.timezone,21),null);
 assert.equal(prediction(rt,'B:back','B:001',day,now,now,db.timezone,11),null);
 assert.equal(normalizeRealtime({...feed,timestamp:now/1000-121},db,now).updates.size,0);
});
test('saved stops and commutes are isolated by city without migrating legacy Skopje keys',()=>{
 const items=new Map(),store={getItem:k=>items.get(k),setItem:(k,v)=>items.set(k,v)},sk=cityStorage(store),bo=cityStorage(store,'boston');
 sk.setItem('tuka-saved','Skopje');bo.setItem('tuka-saved','Boston');assert.equal(items.get('tuka-saved'),'Skopje');assert.equal(bo.getItem('tuka-saved'),'Boston');
});
test('fixed feed proxy does not forward judge credentials or arbitrary URLs',async t=>{
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'https://cdn.mbta.com/realtime/TripUpdates.pb');assert.equal(options.headers.Cookie,undefined);return new Response(new Uint8Array([1,2]));});
 const response=await transitFeed(new Request('https://tuka.test/api/transit/boston/trips',{headers:{Cookie:'secret'}}));assert.equal(response.status,200);
 assert.equal((await transitFeed(new Request('https://tuka.test/api/transit/boston/trips?url=https://evil.test'))).status,400);
 assert.equal((await roadGeometry(new Request('https://tuka.test/api/transit/road-geometry',{method:'POST',body:JSON.stringify({cityId:'boston',points:[[-71.1,42.35],[-71.05,42.35]]})}),{})).status,503);
});

test('Boston saved places and share links preserve the selected city',()=>{
 const from={lat:42.35,lon:-71.08,name:'Home'},to={lat:42.36,lon:-71.06,name:'Work'};
 const link=sharedJourney('https://tuka.test/',from,to,{},'boston'),read=readShared(link);
 assert.equal(read.cityId,'boston');assert.deepEqual(read.origin,from);assert.deepEqual(read.destination,to);
 assert.equal(readShared('https://tuka.test/?city=unknown&stop=1'),null);
 const items=new Map(),store=cityStorage({getItem:k=>items.get(k),setItem:(k,v)=>items.set(k,v)},'boston');
 writePlace(store,'home',from,'boston');assert.deepEqual(readPlaces(store,'boston').home,from);
});
test('an untimed call does not suppress timed departures at the same stop',()=>{
 const data=fixture('boston');data.stop_times.push({...data.stop_times.find(s=>s.stop_id==='B:000'),trip_id:'untimed',arrival_time:'',departure_time:''});
 data.stop_times.push({...data.stop_times.find(s=>s.stop_id==='B:001'),trip_id:'untimed'});data.trips.push({...data.trips[0],trip_id:'untimed'});
 const db=normalizeGTFS(data,'boston');assert(departures(db,null,'B:000',localTimestamp('2026-10-29','07:55',db.timezone)).length);
});

test('each boarding route has a distinct matching colour that survives filtering',()=>{
 const data=fixture('boston'),base=data.trips.find(t=>t.trip_id==='B:out'),calls=data.stop_times.filter(s=>s.trip_id===base.trip_id);
 for(const id of ['1','8','15','19','47','171']){data.routes.push({...data.routes[0],route_id:id});data.trips.push({...base,trip_id:'copy-'+id,route_id:id});data.stop_times.push(...calls.map(s=>({...s,trip_id:'copy-'+id})));}
 const network=boardingNetwork(normalizeGTFS(data,'boston'),'B:000');
 assert.equal(new Set(network.routeColors.values()).size,network.routes.size);
 for(const pattern of network.patterns)assert.equal(pattern.color,network.routeColors.get(pattern.route.route_id));
 const filtered=visibleNetwork(network,new Set(['8','19']),null);
 assert.equal(new Set(filtered.patterns.map(p=>p.color)).size,2);
 for(const pattern of filtered.patterns)assert.equal(pattern.color,network.routeColors.get(pattern.route.route_id));
});
