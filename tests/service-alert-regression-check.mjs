import test from 'node:test';
import assert from 'node:assert/strict';
import {matchingAlerts,matchingStopAlerts} from '../dist/service-alerts.js';
import {departures} from '../dist/transit.js';
import {journeyStatus} from '../dist/journey-follow.js';
import {serviceDay,localTimestamp} from '../dist/schedule.js';
const now=localTimestamp('2026-10-17','08:00'),day=serviceDay(0,now);
function fixture(){
 const route={route_id:'5',agency_id:'jsp',route_type:'3'},trip={trip_id:'t',route_id:'5',service_id:'daily',direction_id:'0'};
 const path=[{trip_id:'t',stop_id:'rekord',seq:1,seconds:8*3600+600,arrivalSeconds:8*3600+600,departure_time:'08:10:00'},{trip_id:'t',stop_id:'mall',seq:2,seconds:8*3600+1200,arrivalSeconds:8*3600+1200,departure_time:'08:20:00'}];
 const db={stops:[{id:'rekord',lat:42,lon:21.4},{id:'mall',lat:42,lon:21.45}],routes:new Map([['5',route]]),trips:new Map([['t',trip]]),times:new Map([['t',path]]),byStop:new Map([['rekord',[path[0]]],['mall',[path[1]]]]),calendar:[{service_id:'daily',start_date:'20260101',end_date:'20261231',saturday:'1'}],exceptions:[]};
 const alert=selectors=>({selectors,periods:[],title:[{text:'Stop closed',language:'en'}]});
 const rt={timestamp:now/1000,alertTimestamp:now/1000,updates:new Map(),vehicles:[],alerts:[alert([{stop:'rekord'}])]};
 const leg={type:'bus',route,tripId:'t',serviceDate:day.date,from:db.stops[0],to:db.stops[1],boardSeq:1,endSeq:2,start:now+600000,end:now+1200000};
 return {db,rt,alert,leg};
}
test('a cancelled or skipped last departure cannot hide a stop closure',()=>{
 const {db,rt}=fixture();rt.updates.set('t|*|'+day.date,{tripRelationship:3});
 // Feed timestamps are fresh relative to this deterministic query instant.
 const original=Date.now;Date.now=()=>now;
 try{assert.equal(departures(db,rt,'rekord',now).length,0);}finally{Date.now=original;}
 assert.equal(matchingStopAlerts(db,rt,'rekord',new Set(['5']),now).length,1);
 rt.updates.clear();rt.updates.set('t|rekord|'+day.date,{relationship:1});
 assert.equal(matchingStopAlerts(db,rt,'rekord',new Set(['5']),now).length,1);
 db.byStop.set('rekord',[]);assert.equal(matchingStopAlerts(db,rt,'rekord',new Set(),now).length,1,'Stop-wide closures do not depend on any remaining service');
});
test('route filters, direction and exact trip date still constrain stop alerts',()=>{
 const {db,rt,alert}=fixture();
 rt.alerts=[alert([{stop:'rekord',route:'5',direction:0}]),alert([{stop:'rekord',route:'7'}]),alert([{stop:'rekord',route:'5',direction:1}]),alert([{trip:'t',date:day.date}]),alert([{trip:'t',date:'20261018'}]),alert([{stop:'other'}])];
 assert.deepEqual(matchingStopAlerts(db,rt,'rekord',new Set(['5']),now),[rt.alerts[0],rt.alerts[3]]);
 assert.equal(matchingStopAlerts(db,rt,'rekord',new Set(['7']),now).length,0);
 assert.equal(matchingStopAlerts(db,rt,'rekord',new Set(['5']),now+121000).length,0,'Stale warnings are not presented as current');
});
test('an upcoming dated closure remains visible for a cancelled scheduled trip',()=>{
 const {db,rt,alert}=fixture();rt.updates.set('t|*|'+day.date,{tripRelationship:3});
 rt.alerts=[{...alert([{stop:'rekord',route:'5'}]),periods:[{start:now/1000+300,end:now/1000+900}]}];
 assert.equal(matchingStopAlerts(db,rt,'rekord',new Set(['5']),now).length,1);
});
test('matching a refreshed journey uses the delayed impact window',()=>{
 const {db,rt,alert,leg}=fixture();
 rt.alerts=[{...alert([{route:'5'}]),periods:[{start:now/1000+1800,end:now/1000+3600}]}];
 rt.updates.set('t|rekord|'+day.date,{departure:{time:now/1000+2400}});
 rt.updates.set('t|mall|'+day.date,{arrival:{time:now/1000+3000}});
 const status=journeyStatus(db,rt,{departure:leg.start,arrival:leg.end,legs:[leg]},now);
 assert.equal(matchingAlerts(db,rt,[leg],now).length,0);
 assert.equal(matchingAlerts(db,rt,status.legs,now).length,1);
});
test('a delayed departure retains its trip-specific alert after its scheduled time has passed',()=>{
 const {db,rt,alert}=fixture(),call=db.byStop.get('rekord')[0];
 call.seconds=7*3600+55*60;call.arrivalSeconds=call.seconds;call.departure_time='07:55:00';
 rt.updates.set('t|rekord|'+day.date,{departure:{time:now/1000+600}});
 rt.alerts=[{...alert([{trip:'t',date:day.date}]),periods:[{start:now/1000,end:now/1000+1200}]}];
 const original=Date.now;Date.now=()=>now;
 try{assert.equal(departures(db,rt,'rekord',now).length,1);}finally{Date.now=original;}
 assert.equal(matchingStopAlerts(db,rt,'rekord',new Set(['5']),now).length,1);
 rt.timestamp-=121;
 assert.equal(matchingStopAlerts(db,rt,'rekord',new Set(['5']),now).length,0,'Expired trip updates cannot extend the service window');
 rt.timestamp=now/1000;rt.updates.clear();rt.updates.set('t|rekord|20261018',{departure:{time:now/1000+600}});
 assert.equal(matchingStopAlerts(db,rt,'rekord',new Set(['5']),now).length,0,'A different service date cannot extend this trip');
});
test('delayed calls match the live impact window while skipped calls retain scheduled coverage',()=>{
 const {db,rt,alert}=fixture();
 rt.updates.set('t|rekord|'+day.date,{departure:{time:now/1000+2400}});
 rt.alerts=[{...alert([{trip:'t',date:day.date}]),periods:[{start:now/1000+300,end:now/1000+900}]},{...alert([{trip:'t',date:day.date}]),periods:[{start:now/1000+1800,end:now/1000+3000}]}];
 assert.deepEqual(matchingStopAlerts(db,rt,'rekord',new Set(['5']),now),[rt.alerts[1]],'Use the live time for normally operating service');
 rt.updates.get('t|rekord|'+day.date).relationship=1;
 assert.deepEqual(matchingStopAlerts(db,rt,'rekord',new Set(['5']),now),rt.alerts,'A skipped call still exposes the closure at its scheduled time');
 rt.updates.clear();rt.updates.set('t|*|'+day.date,{tripRelationship:3});
 assert.deepEqual(matchingStopAlerts(db,rt,'rekord',new Set(['5']),now),[rt.alerts[0]],'A cancelled call still exposes the closure at its scheduled time');
});
