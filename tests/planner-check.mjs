import test from 'node:test';
import assert from 'node:assert/strict';
import {planJourney} from '../dist/planner.js';
import {departures} from '../dist/transit.js';
import {serviceDay,localTimestamp,localDate,localTime,active,hasPublishedService} from '../dist/schedule.js';
import {rankPlaces} from '../dist/place-search.js';
import {savedJourney,readJourneys,writeJourneys,commuteStatus} from '../dist/journey-store.js';
const at=(time,date='2026-10-19')=>localTimestamp(date,time);
const stops=['A','B','C','D','E'].map((id,i)=>({id,stop_id:id,name:id,lat:42+[0,.03,.06,.003,.063][i],lon:21.4}));
function fixture(){return {stops:stops.map(s=>({...s})),routes:new Map(),trips:new Map(),times:new Map(),byStop:new Map(),calendar:[{service_id:'weekday',start_date:'20260101',end_date:'20261231',monday:'1',tuesday:'1',wednesday:'1',thursday:'1',friday:'1',saturday:'0',sunday:'0'}],exceptions:[]};}
function trip(db,id,calls,service='weekday'){
 db.routes.set(id,{route_id:id,route_short_name:id});db.trips.set(id,{trip_id:id,route_id:id,service_id:service,trip_headsign:'C'});
 const path=calls.map(([stop_id,time,extra={}],i)=>{const seconds=time.split(':').reduce((a,n)=>a*60+Number(n),0)*60;return {trip_id:id,stop_id,seq:i+1,seconds,arrivalSeconds:seconds,...extra};});db.times.set(id,path);for(const p of path){if(!db.byStop.has(p.stop_id))db.byStop.set(p.stop_id,[]);db.byStop.get(p.stop_id).push(p);}return path;
}
function network(){const db=fixture();trip(db,'one',[['A','08:05'],['B','08:15']]);trip(db,'two',[['B','08:19'],['C','08:30']]);trip(db,'direct',[['A','08:06'],['C','08:45']]);return db;}
const routes=r=>r.legs.filter(l=>l.type==='bus').map(l=>l.tripId);
test('date inputs use Skopje time and GTFS noon origin across DST',()=>{
 assert.equal(localDate(at('00:15')),'2026-10-19');assert.equal(new Date(at('08:00')).toISOString(),'2026-10-19T06:00:00.000Z');
 assert(Number.isNaN(localTimestamp('2026-03-29','02:30')));assert(Number.isNaN(localTimestamp('2026-02-30','10:00')));
 assert.equal(new Date(localTimestamp('2026-10-25','02:30')).toISOString(),'2026-10-25T00:30:00.000Z');
 assert.equal(serviceDay(0,'2026-03-29').midnight,Date.parse('2026-03-28T22:00:00Z'));
 assert.equal(serviceDay(0,'2026-10-25').midnight,Date.parse('2026-10-24T23:00:00Z'));
});
test('fastest, fewer transfers, tight margin and a simpler alternative',()=>{
 const db=network();const fast=planJourney(db,null,stops[0],stops[2],at('08:00'),{mode:'leave'});
 assert.deepEqual(routes(fast[0]),['one','two']);assert(fast[0].tight);assert.equal(fast[0].connections[0].marginMs,60000);assert(fast.some(r=>r.transfers===0&&!r.tight));
 assert.deepEqual(routes(planJourney(db,null,stops[0],stops[2],at('08:00'),{mode:'leave',preference:'transfers'})[0]),['direct']);
 assert.deepEqual(routes(planJourney(db,null,stops[0],stops[2],at('08:00'),{mode:'leave',minTransfer:5})[0]),['direct']);
});
test('least walking retains a slower option and walking speed changes reachability',()=>{
 const db=fixture();trip(db,'near',[['A','08:10'],['C','08:50']]);trip(db,'far',[['D','08:08'],['E','08:25']]);
 assert.deepEqual(routes(planJourney(db,null,stops[0],stops[2],at('08:00'),{mode:'leave'})[0]),['far']);
 assert.deepEqual(routes(planJourney(db,null,stops[0],stops[2],at('08:00'),{mode:'leave',preference:'walking'})[0]),['near']);
 assert.deepEqual(routes(planJourney(db,null,stops[0],stops[2],at('08:00'),{mode:'leave',walkingSpeed:3})[0]),['near']);
});
test('arrive by searches backward, includes the final walk and applies transfer buffer',()=>{
 const db=network();trip(db,'later',[['A','08:10'],['C','08:38']]);
 const results=planJourney(db,null,stops[0],stops[2],at('08:40'),{mode:'arrive'});
 assert.deepEqual(routes(results[0]),['later']);assert.equal(results[0].departure,at('08:10'));assert.equal(results[0].arrival,at('08:38'),'Do not pad arrival to the deadline with invisible waiting');assert(results.every(r=>r.arrival<=at('08:40')));
 const transfer=planJourney(network(),null,stops[0],stops[2],at('08:40'),{mode:'arrive'})[0];assert.deepEqual(routes(transfer),['one','two']);assert.equal(transfer.connections[0].marginMs,60000);
 assert.equal(planJourney(network(),null,stops[0],stops[2],at('08:40'),{mode:'arrive',minTransfer:5}).length,0);
});
test('selected weekday and calendar exceptions, not today, control service',()=>{
 const db=network();assert.equal(planJourney(db,null,stops[0],stops[2],at('08:00','2026-10-18'),{mode:'leave'}).length,0);
 db.exceptions.push({date:'20261018',service_id:'weekday',exception_type:'1'},{date:'20261019',service_id:'weekday',exception_type:'2'});
 assert(active(db,serviceDay(0,'2026-10-18')).has('weekday'));assert(!active(db,serviceDay(0,'2026-10-19')).has('weekday'));
 assert(planJourney(db,null,stops[0],stops[2],at('08:00','2026-10-18'),{mode:'leave'}).length);
 assert.equal(planJourney(db,null,stops[0],stops[2],at('08:00'),{mode:'leave'}).length,0);
});
test('previous service day and trips crossing midnight work in both directions',()=>{
 const db=fixture();trip(db,'night',[['A','24:10'],['B','24:25'],['C','24:45']]);
 const result=planJourney(db,null,stops[0],stops[2],at('00:00','2026-10-20'),{mode:'leave'})[0];
 assert.equal(result.arrival,at('00:45','2026-10-20'));assert.equal(result.legs[1].serviceDate,'20261019');
 const back=planJourney(db,null,stops[0],stops[2],at('01:00','2026-10-20'),{mode:'arrive'})[0];assert.equal(back.departure,at('00:10','2026-10-20'));
 assert.equal(departures(db,null,'A',at('00:00','2026-10-20'))[0].time,at('00:10','2026-10-20'));
});
test('pickup/drop-off restrictions and arrival/departure dwell are respected',()=>{
 const db=fixture();trip(db,'blocked',[['A','08:10',{pickup_type:'1'}],['C','08:20']]);assert.equal(planJourney(db,null,stops[0],stops[2],at('08:00'),{mode:'leave'}).length,0);
 db.times.get('blocked')[0].pickup_type='0';db.times.get('blocked')[1].drop_off_type='1';assert.equal(planJourney(db,null,stops[0],stops[2],at('08:30'),{mode:'arrive'}).length,0);
 db.times.get('blocked')[1].drop_off_type='0';db.times.get('blocked')[1].arrivalSeconds=8*3600+18*60;
 assert.equal(planJourney(db,null,stops[0],stops[2],at('08:00'),{mode:'leave'})[0].arrival,at('08:18'));
});
test('future searches never borrow live predictions; stale live data expires',()=>{
 const original=Date.now;Date.now=()=>at('08:00');try{
 const db=fixture();trip(db,'live',[['A','08:05'],['C','08:20']]);const rt={timestamp:Date.now()/1000,updates:new Map([['live|A|',{delay:120}],['live|C|',{delay:120}]]),additionalArrivals:[]};
 const now=planJourney(db,rt,stops[0],stops[2],Date.now())[0];assert.equal(now.arrival,at('08:22'));assert(now.legs[1].live);
 const tomorrow=planJourney(db,rt,stops[0],stops[2],at('08:00','2026-10-20'),{mode:'leave'})[0];assert.equal(tomorrow.arrival,at('08:20','2026-10-20'));assert(!tomorrow.legs[1].live);
 assert(!departures(db,rt,'A',at('08:00','2026-10-20'))[0].live);rt.timestamp-=121;assert(!planJourney(db,rt,stops[0],stops[2],Date.now())[0].legs[1].live);
 }finally{Date.now=original;}
});
test('exact destination beats similarly named hotels, including Cyrillic',()=>{
 const list=[{name:'Macedonia Square Hotel',type:'Hotel',lat:42,lon:21.4},{name:'Macedonia Square',type:'Square',lat:42.01,lon:21.4}];assert.equal(rankPlaces(list,'Macedonia Square, Skopje')[0].name,'Macedonia Square');assert(rankPlaces([{name:'Македонија',lat:42,lon:21.4}],'Makedonija')[0].exact);
});
test('saved commutes survive reload without treating a timetable as confirmed service',()=>{
 const r=planJourney(network(),null,stops[0],stops[2],at('08:00'),{mode:'leave'})[0];const row=savedJourney(stops[0],stops[2],{mode:'arrive',minTransfer:5},r,'Work');
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};writeJourneys(storage,[row]);const restored=readJourneys(storage)[0];assert.equal(restored.options.mode,'now');assert.equal(restored.options.minTransfer,5);assert.deepEqual(restored.origin,row.origin);assert.equal(commuteStatus(restored,[r]).kind,'warning');
 r.tight=false;assert.match(commuteStatus(restored,[r]).text,/unconfirmed/);assert.match(commuteStatus(restored,[]).text,/No journey/);
});

test('calendar metadata alone does not promise published future trips',()=>{
 const db=fixture();trip(db,'today',[['A','08:00'],['C','08:30']],'today');db.calendar.push({service_id:'today',start_date:'20261017',end_date:'20261017',saturday:'1'});
 assert(hasPublishedService(db,at('08:00','2026-10-17')));assert(!hasPublishedService(db,at('08:00')));
});
test('arrive-by includes egress walking and cannot slip past the deadline',()=>{
 const db=network();trip(db,'late',[['A','08:10'],['C','08:38']]);const result=planJourney(db,null,stops[0],{...stops[2],lat:stops[2].lat+.003},at('08:40'),{mode:'arrive'})[0];assert.deepEqual(routes(result),['one','two']);assert(result.arrival<=at('08:40'));assert(result.legs.at(-1).walkingMs>0);
});
test('trip-level cancellation excludes a bus even without stop events',()=>{
 const original=Date.now;Date.now=()=>at('08:00');try{const db=fixture();trip(db,'cancelled',[['A','08:05'],['C','08:20']]);const rt={timestamp:Date.now()/1000,updates:new Map([['cancelled|*|20261019',{tripRelationship:3}]])};assert.equal(planJourney(db,rt,stops[0],stops[2],Date.now()).length,0);assert.equal(departures(db,rt,'A',Date.now()).length,0);}finally{Date.now=original;}
});

test('each displayed transfer margin belongs to its own journey',()=>{const db=network();trip(db,'later-connection',[['B','08:29'],['C','08:40']]);const rows=planJourney(db,null,stops[0],stops[2],at('08:00'),{mode:'leave'});for(const r of rows)r.legs.forEach((leg,i)=>{if(leg.type==='transfer')assert.equal(leg.connection.marginMs,r.legs[i+1].start-r.legs[i-1].end-leg.walkingMs-leg.bufferMs);});});

test('missed bus excludes only that trip instance; known street walks can invalidate a boarding',()=>{
 const db=network(),excludedTrips=[{tripId:'one',serviceDate:'20261019'}];
 assert(!planJourney(db,null,stops[0],stops[2],at('08:00'),{mode:'leave',excludedTrips}).some(r=>routes(r).includes('one')));
 assert(planJourney(db,null,stops[0],stops[2],at('08:00','2026-10-20'),{mode:'leave',excludedTrips}).some(r=>routes(r).includes('one')));
 const result=planJourney(db,null,stops[0],stops[2],at('08:00'),{mode:'leave',walkingDistance:(a,b)=>a===stops[0]&&b.id==='A'?1000:undefined});
 assert(!result.some(r=>routes(r).includes('one')));
});
