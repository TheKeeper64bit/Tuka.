import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
import {normalizeGTFS,cityStorage} from '../dist/gtfs.js';
import {departures,decodeRealtime,normalizeRealtime} from '../dist/transit.js';
import {planJourney} from '../dist/planner.js';import {localTimestamp,serviceDay,active} from '../dist/schedule.js';
import {boardingNetwork} from '../dist/stop-network.js';import {cityAtLocation} from '../dist/city-providers.js';
import {filterNetherlandsFeed,netherlandsFeed,tilburgNotices} from '../server/netherlands.js';
import {validateIntent,interpretJourney} from '../server/meta-intent.js';import {articleMarkup,createNewsView} from '../dist/news.js';
const compact=JSON.parse(gunzipSync(readFileSync(new URL('../dist/tilburg-network.bin',import.meta.url))));
const db=normalizeGTFS(compact.tables,'tilburg',compact),at=(d,t)=>localTimestamp(d,t,db.timezone);
const varint=n=>{const a=[];do{a.push((n%128)|(n>=128?128:0));n=Math.floor(n/128);}while(n);return a;};
const bytes=(k,v)=>[...varint(k*8+2),...varint(v.length),...v],text=(k,v)=>bytes(k,[...new TextEncoder().encode(v)]),num=(k,v)=>[...varint(k*8),...varint(v)];
const entity=(id,kind,body)=>bytes(2,[...text(1,id),...bytes(kind,body)]),header=now=>bytes(1,[...text(1,'2.0'),...num(3,Math.floor(now/1000))]);
const translated=(k,v)=>bytes(k,bytes(1,text(1,v)));
const now=at('2026-10-30','08:00'),tripId=[...db.trips.keys()].find(id=>active(db,serviceDay(0,now,db.timezone)).has(db.trips.get(id).service_id)),trip=db.trips.get(tripId),call=db.times.get(tripId)[0];
const feed=stamp=>new Uint8Array([...header(stamp),...entity('regional',3,[...bytes(1,[...text(1,tripId),...text(3,'20261030')]),...bytes(2,[...num(1,call.seq),...text(4,call.stop_id),...bytes(3,num(1,60))])]),...entity('foreign',3,bytes(1,text(1,'outside-region'))),...entity('notice',5,[...bytes(1,[...num(1,Math.floor(stamp/1000)-60),...num(2,Math.floor(stamp/1000)+600)]),...bytes(5,text(2,trip.route_id)),...translated(10,'Stop closed'),...translated(11,'Use the replacement stop as signed.')]),...entity('expired',5,[...bytes(1,num(2,Math.floor(stamp/1000)-1)),...bytes(5,text(5,call.stop_id)),...translated(10,'Expired')]),...entity('foreign-notice',5,[...bytes(5,text(2,'foreign-route')),...translated(10,'Outside area')])]);
const index={version:'test',tripIds:[tripId],stopIds:[call.stop_id],routeIds:[trip.route_id]};
const env={ASSETS:{fetch:async()=>Response.json(index)}};
test('Tilburg snapshot has complete references, agency zone, calendars and attribution',()=>{
 assert.equal(db.timezone,'Europe/Amsterdam');assert.equal(db.routes.size,100);assert.equal(db.trips.size,16873);assert.equal(db.byStop.size,2606);
 assert.equal(db.calendar.length,0);assert(db.exceptions.length);assert(db.maxSeconds>86400);assert(db.licenses.some(l=>l.license_spdx_id==='ODbL-1.0'));
 const serviceIds=new Set([...db.calendar,...db.exceptions].map(r=>r.service_id));
 for(const t of db.trips.values()){assert(db.routes.has(t.route_id));assert(serviceIds.has(t.service_id));const path=db.times.get(t.trip_id);assert(path.length>=2);for(let i=0;i<path.length;i++){assert(db.stopIndex.has(path[i].stop_id));if(i)assert(path[i].seq>path[i-1].seq);}}
 assert(db.stops.some(s=>s.lon<4.65||s.lon>5.55||s.lat<51.35||s.lat>51.85),'Cross-boundary calls retained');
});
test('Tilburg direct, transfer and arrive-by journeys use exact feed calls and walking limits',()=>{
 const start=db.stopIndex.get('4220130'),central=db.stopIndex.get('4220128'),reeshof=db.stopIndex.get('4220354'),hospital=db.stopIndex.get('4220164');
 const direct=planJourney(db,null,start,central,now,{mode:'leave'});assert(direct.some(p=>p.transfers===0&&p.legs.some(l=>l.type==='bus')));
 const transfers=planJourney(db,null,reeshof,hospital,now,{mode:'leave'});assert(transfers.length&&transfers.every(p=>p.transfers>0));
 const deadline=at('2026-10-30','09:00'),arrive=planJourney(db,null,start,central,deadline,{mode:'arrive',maxWalkingMinutes:1});assert(arrive.length);assert(arrive.every(p=>p.arrival<=deadline&&p.legs.filter(l=>l.type!=='bus').reduce((s,l)=>s+l.walkingMs,0)<=60000));
 for(const result of [...direct,...transfers,...arrive])for(const leg of result.legs.filter(l=>l.type==='bus')){const path=db.times.get(leg.tripId),day=serviceDay(0,leg.serviceDate.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'),db.timezone);assert.equal(leg.start,day.midnight+path.find(c=>c.seq===leg.boardSeq).seconds*1000);assert.equal(leg.end,day.midnight+path.find(c=>c.seq===leg.endSeq).arrivalSeconds*1000);assert(!leg.live);}
});
test('exception-only calendar and previous-service-day 25-hour departures work',()=>{
 const t=[...db.trips.values()].find(t=>active(db,serviceDay(0,now,db.timezone)).has(t.service_id)&&db.times.get(t.trip_id).some(c=>c.seconds>86400&&c.pickup_type!=='1'));
 assert(t);const c=db.times.get(t.trip_id).find(c=>c.seconds>86400&&c.pickup_type!=='1'),day=serviceDay(0,now,db.timezone),expected=day.midnight+c.seconds*1000;
 const rows=departures(db,null,c.stop_id,expected-1000,10000);assert(rows.some(r=>r.trip.trip_id===t.trip_id&&r.day.date==='20261030'&&r.time===expected));
 assert.equal(active(db,serviceDay(0,'2027-01-01',db.timezone)).size,0);
});
test('stop route colors stay distinct, use shapes where valid, and filters preserve identity',()=>{
 const net=boardingNetwork(db,'4220128');assert.equal(net.routes.size,5);assert.equal(new Set(net.routeColors.values()).size,5);assert(net.patterns.some(p=>!p.approximate));
 assert.equal(cityAtLocation({lat:51.56,lon:5.08}).id,'tilburg');assert.equal(cityAtLocation({lat:0,lon:0}),null);
 const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};for(const c of ['skopje','boston','tilburg'])cityStorage(storage,c).setItem('tuka-favourites',c);for(const c of ['skopje','boston','tilburg'])assert.equal(cityStorage(storage,c).getItem('tuka-favourites'),c);
});
test('national protobuf filtering preserves exact regional entities, drops foreign entities',()=>{
 const filtered=decodeRealtime(filterNetherlandsFeed(feed(now),index));assert.equal(filtered.timestamp,now/1000);assert.equal(filtered.updates.size,1);assert.equal(filtered.alerts.length,2);assert([...filtered.updates.keys()][0].startsWith(tripId+'|'));
});
test('OVapi proxy only accepts fixed read-only sources; failure is not a cancellation',async()=>{
 let calls=0;const fetcher=async url=>{calls++;assert.equal(url,'https://gtfs.ovapi.nl/nl/tripUpdates.pb');return new Response(feed(now));};
 const r=await netherlandsFeed(new Request('https://local/api/transit/tilburg/trips'),env,{fetcher});assert.equal(r.status,200);assert.equal(decodeRealtime(new Uint8Array(await r.arrayBuffer())).updates.size,1);
 assert.equal((await netherlandsFeed(new Request('https://local/api/transit/tilburg/trips?url=https://evil'),env,{fetcher})).status,400);
 assert.equal((await netherlandsFeed(new Request('https://local/api/transit/tilburg/trips',{method:'POST'}),env,{fetcher})).status,405);assert.equal(calls,1);
 const failed=await netherlandsFeed(new Request('https://local/api/transit/tilburg/trips'),env,{fetcher:async()=>new Response('',{status:503})});assert.equal(failed.status,503);assert.match((await failed.json()).error,/does not mean a cancellation/);
});
test('operator notices expire, retain source advice, and never invent publication dates',async()=>{
 const stamp=Date.now(),r=await tilburgNotices(new Request('https://local/api/news?city=tilburg'),env,{fetcher:async()=>new Response(feed(stamp))});assert.equal(r.status,200);const data=await r.json();assert.equal(data.articles.length,1);const a=data.articles[0];assert.equal(a.publishedAt,null);assert.match(a.paragraphs[0],/replacement stop/);assert.match(articleMarkup(a,0,'tilburg'),/Operator notice/);assert.equal(articleMarkup({...a,sourceUrl:'https://evil.test/'},0,'tilburg'),'');
 const old=await tilburgNotices(new Request('https://local/api/news?city=tilburg'),env,{fetcher:async()=>new Response(feed(stamp-601000))});assert.equal(old.status,503);
});
test('real-time matching rejects stale, foreign, wrong-date and distant vehicles',()=>{
 const stop=db.stopIndex.get(call.stop_id),v={id:'bus',tripId,routeId:trip.route_id,date:'20261030',seq:call.seq,stopId:call.stop_id,lat:stop.lat,lon:stop.lon,timestamp:now/1000};
 const raw={timestamp:now/1000,updates:new Map(),vehicles:[v,{...v,id:'foreign',lat:42,lon:21},{...v,id:'stale',timestamp:now/1000-121},{...v,id:'bad-date',date:'20270101'}],alerts:[]};assert.deepEqual(normalizeRealtime(raw,db,now).vehicles.map(v=>v.id),['bus']);assert.equal(normalizeRealtime(raw,db,now+121000).vehicles.length,0);
});
const intent={origin:null,destination:'Tilburg Central Station',mode:'arrive',date:'2026-10-30',time:'09:00',maxWalkingMinutes:10,preference:'fastest'};
test('Meta interpretation validates constraints and rejects model-supplied itineraries',async()=>{
 assert.equal(validateIntent(intent,'tilburg',now).maxWalkingMinutes,10);assert.throws(()=>validateIntent({...intent,trips:['made-up']},'tilburg',now));assert.throws(()=>validateIntent({...intent,date:'2026-02-30'},'tilburg',now));assert.throws(()=>validateIntent({...intent,maxWalkingMinutes:999},'tilburg',now));
 let payload;const r=await interpretJourney(new Request('https://local/api/meta/interpret',{method:'POST',body:JSON.stringify({cityId:'tilburg',message:'Central by 9, walking under 10 minutes'})}),{META_AI_TOKEN:'test-only'},{now,fetcher:async(_url,init)=>{payload=JSON.parse(init.body);return Response.json({choices:[{message:{tool_calls:[{function:{name:'plan_transit_journey',arguments:JSON.stringify(intent)}}]}}]});}});assert.equal(r.status,200);assert.deepEqual((await r.json()).intent,intent);assert.equal(payload.tool_choice.function.name,'plan_transit_journey');assert(!JSON.stringify(payload).includes('test-only'));
});
test('late previous-city news responses cannot overwrite Tilburg notices',async()=>{
 const els=new Map(['#news-list','#news-status','#news-refresh'].map(k=>[k,{innerHTML:'',setAttribute(){}}]));let release,calls=0;const view=createNewsView({querySelector:s=>els.get(s)},async url=>{calls++;if(!url.includes('tilburg'))return new Promise(r=>release=r);return Response.json({articles:[],checkedAt:new Date().toISOString()});});
 const first=view.open();view.setCity('tilburg');await new Promise(r=>setTimeout(r,0));release(Response.json({articles:[{title:'JSP old',sourceUrl:'https://skopjebus.mk/x',publishedAt:new Date().toISOString(),paragraphs:[]}]}));await first;assert.equal(calls,2);assert(!els.get('#news-list').innerHTML.includes('JSP old'));
});
