import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewFeed} from '../dist/feed-import.js';
import {inspectFeed} from '../dist/feed-profile.js';
import {registerProvider,unregisterProvider,providerFor,hasProvider,cityAtLocation} from '../dist/city-providers.js';
import {normalizeGTFS,cityStorage} from '../dist/gtfs.js';
import {parseGTFSZip} from '../dist/gtfs-zip.js';
import {departures,realtime} from '../dist/transit.js';
import {planJourney} from '../dist/planner.js';
import {boardingNetwork,visibleNetwork} from '../dist/stop-network.js';
import {localTimestamp} from '../dist/schedule.js';
import {sharedJourney,readShared} from '../dist/journey-tools.js';
const base=()=>{
 const tables=JSON.parse(readFileSync(new URL('./fixtures/boston-gtfs.json',import.meta.url)));
 tables.agency=[{agency_id:'operator',agency_name:'新しい交通',agency_timezone:'Asia/Tokyo'}];
 tables.stops.forEach((s,i)=>{s.stop_lat=String(35.6+i*.02);s.stop_lon=String(139.6+i*.02);s.stop_name=['新しい駅','中央駅','海岸'][i];});
 delete tables.shapes;return tables;
};
const csv=rows=>{const keys=[...new Set(rows.flatMap(Object.keys))],cell=s=>'"'+String(s??'').replaceAll('"','""')+'"';return keys.join(',')+'\n'+rows.map(r=>keys.map(k=>cell(r[k])).join(',')).join('\n');};
export function zipTables(tables,{nested=false,duplicate=false}={}){
 const files=Object.entries(tables).map(([name,rows])=>[(nested?'export/':'')+name+'.txt',Buffer.from(csv(rows))]);if(duplicate)files.push(['again/stops.txt',files.find(([n])=>n.endsWith('/stops.txt')||n==='stops.txt')[1]]);
 const local=[],central=[];let offset=0;
 for(const [name,data] of files){const n=Buffer.from(name),h=Buffer.alloc(30),c=Buffer.alloc(46);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(n.length,26);local.push(h,n,data);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);central.push(c,n);offset+=h.length+n.length+data.length;}
 const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);return new Blob([Buffer.concat([...local,cd,end])]);
}
test('an unseen GTFS network uses the same map, departures, planner and share contracts',async()=>{
 const record=await reviewFeed(zipTables(base(),{nested:true}),'Tokyo fixture',{worker:false}),p=record.profile;
 assert.match(p.id,/^gtfs-[a-f0-9]{64}$/);assert.equal(hasProvider(p.id),false);registerProvider(p);
 try{
  assert.equal(providerFor(p.id).name,'Tokyo fixture');assert.equal(p.timezone,'Asia/Tokyo');assert.equal(cityAtLocation({lat:35.62,lon:139.62}).id,p.id);assert.equal(p.news,undefined);assert.deepEqual(p.capabilities,['scheduled']);
  const db=normalizeGTFS(base(),p.id),now=localTimestamp('2026-10-29','07:55',db.timezone);
  assert.equal(db.provider,p.id);assert.equal(db.stops[0].name,'新しい駅');assert.equal(departures(db,null,'B:000',now)[0].trip.trip_id,'B:out');
  assert(planJourney(db,null,db.stops[0],db.stops[2],now,{mode:'leave'}).some(r=>r.legs.some(l=>l.type==='bus')));
  const network=boardingNetwork(db,'B:000'),visible=visibleNetwork(network,new Set(db.routes.keys()),'B:001');assert(visible.patterns.length);assert.equal(visible.patterns[0].downstream.at(-1).stop_id,'B:001');
  const live=await realtime(db);assert.equal(live.available,false);assert.equal(live.vehicles.length,0);
  const shared=readShared(sharedJourney('https://tuka.test/',db.stops[0],db.stops[2],{},p.id));assert.equal(shared.cityId,p.id);
  assert.equal((await reviewFeed(record.blob,'A different display name',{worker:false})).id,p.id);
 }finally{unregisterProvider(p.id);}
});
test('imported networks with identical GTFS IDs keep separate saved state',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},a=cityStorage(storage,'gtfs-'+'a'.repeat(64)),b=cityStorage(storage,'gtfs-'+'b'.repeat(64));a.setItem('tuka-saved','A');b.setItem('tuka-saved','B');assert.equal(a.getItem('tuka-saved'),'A');assert.equal(b.getItem('tuka-saved'),'B');assert.equal(data.get('tuka-saved'),undefined);
});
test('frequency templates expand into bounded runs and missing intermediate times interpolate',()=>{
 const t=base();t.trips=t.trips.filter(r=>r.trip_id==='B:out');t.stop_times=t.stop_times.filter(r=>r.trip_id==='B:out');t.stop_times[1].arrival_time='';t.stop_times[1].departure_time='';t.frequencies=[{trip_id:'B:out',start_time:'08:00:00',end_time:'09:00:00',headway_secs:'600',exact_times:'0'}];
 const id='gtfs-'+'c'.repeat(64),p=inspectFeed(t,id),db=normalizeGTFS(t,id,null,p);assert.equal(db.trips.size,6);assert(!db.trips.has('B:out'));const trip=[...db.trips.values()][0],path=db.times.get(trip.trip_id);assert.equal(trip.frequencyEstimated,true);assert(path[1].interpolated);assert(path[1].seconds>path[0].seconds);assert(path[1].seconds<path[2].seconds);assert.equal(path[2].seconds-path[0].seconds,1200);
});
test('ZIP review rejects duplicates, broken inputs, unsupported zones and oversized uploads before registration',async()=>{
 await assert.rejects(()=>reviewFeed(new Blob(['no zip']),''),/ZIP/);
 await assert.rejects(()=>reviewFeed({size:51*1024*1024},''),/50 MB/);
 const dup=await zipTables(base(),{nested:true,duplicate:true}).arrayBuffer();await assert.rejects(()=>parseGTFSZip(dup),/duplicate/);
 const t=base();t.agency[0].agency_timezone='Invalid/Zone';assert.throws(()=>inspectFeed(t,'gtfs-'+'d'.repeat(64)),/time zone/i);
 t.agency[0].agency_timezone='Asia/Tokyo';t.stop_times=[];assert.throws(()=>inspectFeed(t,'gtfs-'+'d'.repeat(64)),/usable trips/);assert.equal(hasProvider('gtfs-'+'d'.repeat(64)),false);
});

test('import diagnostics reject duplicate identifiers and trip calendars that cannot operate',()=>{
 const id='gtfs-'+'e'.repeat(64),t=base();t.stops.push({...t.stops[0]});assert.throws(()=>inspectFeed(t,id),/duplicate stop_id/);t.stops.pop();for(const trip of t.trips)trip.service_id='not-a-calendar';assert.throws(()=>inspectFeed(t,id),/service calendar/);
});
test('broken frequency windows and non-monotone trips cannot become plausible departures',()=>{
 const t=base(),id='gtfs-'+'f'.repeat(64);t.frequencies=[{trip_id:'B:out',start_time:'08:00:00',end_time:'09:00:00',headway_secs:'0'}];assert.throws(()=>inspectFeed(t,id),/frequency window/);delete t.frequencies;
 const calls=t.stop_times.filter(r=>r.trip_id==='B:out').sort((a,b)=>+a.stop_sequence-+b.stop_sequence);calls.at(-1).arrival_time='07:00:00';calls.at(-1).departure_time='07:00:00';const p=inspectFeed(t,id),db=normalizeGTFS(t,id,null,p);assert(!db.trips.has('B:out'));assert(p.warnings.some(w=>w.includes('excluded')));
});

test('platforms inherit valid station coordinates without losing their own stop IDs',()=>{
 const t=base();t.stops.push({stop_id:'parent',stop_name:'Station',stop_lat:t.stops[0].stop_lat,stop_lon:t.stops[0].stop_lon,location_type:'1'});t.stops[0].parent_station='parent';t.stops[0].stop_lat='';t.stops[0].stop_lon='';const id='gtfs-'+'1'.repeat(64),p=inspectFeed(t,id),db=normalizeGTFS(t,id,null,p);assert.equal(db.stopIndex.get('B:000').lat,35.6);assert(db.byStop.has('B:000'));assert(db.trips.has('B:out'));
});
test('imported stop and trip transfer rules constrain both leave-at and arrive-by plans',()=>{
 const t={agency:[{agency_name:'Transfers',agency_timezone:'Asia/Tokyo'}],stops:[{stop_id:'a',stop_name:'A',stop_lat:'35.6',stop_lon:'139.6'},{stop_id:'b',stop_name:'B',stop_lat:'35.63',stop_lon:'139.63'},{stop_id:'c',stop_name:'C',stop_lat:'35.66',stop_lon:'139.66'}],routes:[{route_id:'r',route_short_name:'1',route_type:'3'}],trips:[{trip_id:'in',route_id:'r',service_id:'day'},{trip_id:'early',route_id:'r',service_id:'day'},{trip_id:'later',route_id:'r',service_id:'day'}],calendar_dates:[{service_id:'day',date:'20261029',exception_type:'1'}],stop_times:[]};
 for(const [trip,from,to,start,end] of [['in','a','b','08:00:00','08:10:00'],['early','b','c','08:12:00','08:25:00'],['later','b','c','08:20:00','08:35:00']])t.stop_times.push({trip_id:trip,stop_id:from,stop_sequence:'1',arrival_time:start,departure_time:start},{trip_id:trip,stop_id:to,stop_sequence:'2',arrival_time:end,departure_time:end});
 const id='gtfs-'+'2'.repeat(64),p=inspectFeed(t,id),plans=mode=>{const db=normalizeGTFS(t,id,null,p);return planJourney(db,null,db.stopIndex.get('a'),db.stopIndex.get('c'),localTimestamp('2026-10-29',mode==='arrive'?'08:40':'07:55',db.timezone),{mode,minTransfer:0});};
 assert(plans('leave').some(r=>r.legs.some(l=>l.tripId==='early')));
 t.transfers=[{from_stop_id:'b',to_stop_id:'b',transfer_type:'2',min_transfer_time:'600'}];
 for(const mode of ['leave','arrive']){const r=plans(mode);assert(r.some(j=>j.legs.some(l=>l.tripId==='later')));assert(r.every(j=>!j.legs.some(l=>l.tripId==='early')));}
 t.transfers=[{from_stop_id:'b',to_stop_id:'b',transfer_type:'3'}];assert.equal(plans('leave').length,0);assert.equal(plans('arrive').length,0);
 t.transfers=[{from_stop_id:'b',to_stop_id:'b',from_trip_id:'in',to_trip_id:'early',transfer_type:'3'}];assert(plans('leave').some(j=>j.legs.some(l=>l.tripId==='later')));assert(plans('leave').every(j=>!j.legs.some(l=>l.tripId==='early')));
});

test('GTFS review reports verified anomalies and leaves ZIP bytes unchanged',async()=>{
 const tables=base();
 tables.agency[0].agency_url='https://example.org';
 for(const r of tables.routes)r.agency_id='operator';
 tables.calendar.forEach(row=>{row.start_date='20000101';row.end_date='20001231';});
 tables.calendar_dates=[];
 tables.trips[0].shape_id='bad';
 tables.trips.push({...tables.trips[0],trip_id:'orphan',route_id:'missing',direction_id:'3'});
 tables.stop_times.push({...tables.stop_times[0],trip_id:'missing'});
 tables.shapes=[{shape_id:'bad',shape_pt_lat:'0',shape_pt_lon:'0',shape_pt_sequence:'1'},{shape_id:'bad',shape_pt_lat:'1',shape_pt_lon:'1',shape_pt_sequence:'2'}];
 tables.pathways=[{pathway_id:'unsupported'}];
 const zip=zipTables(tables),record=await reviewFeed(zip,'Fixture',{worker:false});
 const codes=new Set(record.profile.diagnostics.findings.map(row=>row.code));
 for(const code of ['trip_reference','direction','stop_reference','expired_calendar','suspicious_shape','unsupported'])assert(codes.has(code),code);
 assert.equal(record.blob,zip);
 assert.deepEqual((await reviewFeed(zip,'Other name',{worker:false})).profile.diagnostics,record.profile.diagnostics);
});

test('Network Inspector skips clean feeds, falls back, caches and rejects unsupported model output',async()=>{
 const {inspectNetwork}=await import('../server/network-inspector.js');
 const env={MODEL_API_KEY:'test-only',BASETEN_API_KEY:'test-only',BASETEN_MODEL:'fixture'};
 const findings=[{code:'direction',severity:'warning',count:2,ids:['route-1']}];
 const req=(hash='a',items=findings)=>new Request('https://tuka.test/api/meta/network-inspector',{method:'POST',body:JSON.stringify({hash:hash.repeat(64),version:1,findings:items})});
 let calls=0;
 const fetcher=async(url,options)=>{
  calls++;
  assert(!options.body.includes('stop_times.txt'));
  if(url.includes('meta.ai'))return new Response('',{status:503});
  return Response.json({choices:[{message:{content:JSON.stringify({suggestions:[{code:'direction',check:'headsigns'}]})}}],usage:{prompt_tokens:121,completion_tokens:18,total_tokens:139}});
 };
 assert((await (await inspectNetwork(req('a',[]),env,{fetcher})).json()).skipped);
 assert.equal(calls,0);
 const result=await (await inspectNetwork(req(),env,{fetcher})).json();
 assert.equal(result.provider,'baseten');assert.equal(result.usage.total,139);assert.equal(calls,2);
 assert((await (await inspectNetwork(req(),env,{fetcher})).json()).cached);assert.equal(calls,2);
 assert.equal((await inspectNetwork(req(),{...env,NETWORK_INSPECTOR_ENABLED:'false'},{fetcher})).status,503);
 assert.equal((await inspectNetwork(req(),{},{fetcher})).status,503);
 assert.equal((await inspectNetwork(req('b'),env,{fetcher:async()=>Response.json({choices:[{message:{content:'{"suggestions":[{"code":"direction","check":"replace coordinates"}]}'}}]})})).status,502);
 assert.equal((await inspectNetwork(req('c'),env,{fetcher:async()=>new Response('',{status:503})})).status,502);
});

test('well-formed timetable with valid shapes has no inspector findings',async()=>{
 const t=base();
 t.agency[0].agency_url='https://example.org';
 for(const route of t.routes)route.agency_id='operator';
 t.calendar.forEach(row=>{row.end_date='20991231';});
 t.calendar_dates=t.calendar_dates.filter(row=>row.exception_type==='1');
 t.shapes=[];
 for(const trip of t.trips){
  trip.shape_id=trip.trip_id+'-shape';
  const calls=t.stop_times.filter(call=>call.trip_id===trip.trip_id);
  for(const call of calls){
   const stop=t.stops.find(stop=>stop.stop_id===call.stop_id);
   t.shapes.push({shape_id:trip.shape_id,shape_pt_lat:stop.stop_lat,shape_pt_lon:stop.stop_lon,shape_pt_sequence:call.stop_sequence});
  }
 }
 const result=await reviewFeed(zipTables(t),'Clean fixture',{worker:false});
 assert.deepEqual(result.profile.diagnostics.findings,[]);
});
