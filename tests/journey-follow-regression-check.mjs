import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyStatus} from '../dist/journey-follow.js';
import {planJourney} from '../dist/planner.js';
import {localTimestamp,serviceDay} from '../dist/schedule.js';

const at=(time,date='2026-10-19')=>localTimestamp(date,time);
const stops=['A','M','B','C'].map((id,i)=>({id,stop_id:id,name:id,lat:42+i*.015,lon:21.4}));
function fixture(){
  const db={stops,routes:new Map(),trips:new Map(),times:new Map(),byStop:new Map(),calendar:[{service_id:'weekday',start_date:'20260101',end_date:'20261231',monday:'1'}],exceptions:[]};
  const add=(id,calls)=>{
    db.routes.set(id,{route_id:id,route_short_name:id});
    db.trips.set(id,{trip_id:id,route_id:id,service_id:'weekday'});
    const times=calls.map(([stop_id,seconds],i)=>({trip_id:id,stop_id,seq:i+1,seconds,arrivalSeconds:seconds}));
    db.times.set(id,times);
    for(const call of times){if(!db.byStop.has(call.stop_id))db.byStop.set(call.stop_id,[]);db.byStop.get(call.stop_id).push(call);}
  };
  add('first',[['A',8*3600+5*60],['M',8*3600+15*60],['B',8*3600+20*60]]);
  add('second',[['B',8*3600+25*60],['C',8*3600+40*60]]);
  return db;
}
const live=(now,updates)=>({timestamp:now/1000,updates:new Map(updates)});
const busLeg=(db,id,day='20261019')=>{
  const calls=db.times.get(id),first=calls[0],last=calls.at(-1),midnight=serviceDay(0,day.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3')).midnight;
  return {type:'bus',tripId:id,serviceDate:day,route:db.routes.get(id),boardSeq:first.seq,endSeq:last.seq,from:stops.find(s=>s.id===first.stop_id),to:stops.find(s=>s.id===last.stop_id),start:midnight+first.seconds*1000,end:midnight+last.arrivalSeconds*1000};
};

test('intermediate live calls invalidate a previously safe transfer just as in the planner',()=>{
  const db=fixture(),now=at('08:00'),result=planJourney(db,null,stops[0],stops[3],now,{mode:'leave'})[0];
  assert.equal(result.legs.find(l=>l.type==='transfer').connection.marginMs,120000);
  const rt=live(now,[['first|M|20261019',{arrival:{time:at('08:28')/1000},departure:{time:at('08:29')/1000}}],['first|B|20261019',{arrival:{time:at('08:21')/1000}}]]);
  const status=journeyStatus(db,rt,result,now),first=status.legs.find(l=>l.tripId==='first'),transfer=status.legs.find(l=>l.type==='transfer');
  assert.equal(first.end,at('08:29'),'An exit estimate cannot precede an earlier stop departure');
  assert.equal(first.arrivalLive,true);
  assert.equal(transfer.connection.availableMs,-240000);
  assert.equal(transfer.connection.marginMs,-420000);
  assert.equal(status.disrupted,true);
  const originalNow=Date.now;
  try{Date.now=()=>now;assert.equal(planJourney(db,rt,stops[0],stops[3],now).length,0);}
  finally{Date.now=originalNow;}
  assert.equal(result.legs.find(l=>l.type==='transfer').connection.marginMs,120000,'Refreshing must not overwrite the selected snapshot');
});

test('updates before boarding constrain boarding time, and propagated live flags expire',()=>{
  const db=fixture(),now=at('08:00'),leg={...busLeg(db,'first'),boardSeq:2,from:stops[1],start:at('08:15')},result={departure:leg.start,legs:[leg]};
  const rt=live(now,[['first|A|20261019',{departure:{time:at('08:26')/1000}}]]);
  const fresh=journeyStatus(db,rt,result,now);
  assert.equal(fresh.legs[0].start,at('08:26'));assert.equal(fresh.legs[0].end,at('08:26'));assert.equal(fresh.live,true);
  const expired=journeyStatus(db,rt,result,now+120000);
  assert.equal(expired.legs[0].start,at('08:15'));assert.equal(expired.legs[0].end,at('08:20'));assert.equal(expired.live,false);
});

test('overnight propagation uses the exact service date, never an undated or other-day update',()=>{
  const db=fixture();
  db.times.set('first',db.times.get('first').map((call,i)=>({...call,seconds:24*3600+[10,20,25][i]*60,arrivalSeconds:24*3600+[10,20,25][i]*60})));
  const now=at('00:05','2026-10-20'),leg=busLeg(db,'first'),result={departure:leg.start,legs:[leg]};
  const update={departure:{time:at('00:35','2026-10-20')/1000}};
  for(const date of ['', '20261020'])assert.equal(journeyStatus(db,live(now,[[`first|M|${date}`,update]]),result,now).arrival,at('00:25','2026-10-20'));
  assert.equal(journeyStatus(db,live(now,[['first|M|20261019',update]]),result,now).arrival,at('00:35','2026-10-20'));
});

test('cancellation anywhere in the run is retained; only skipped boarding or exit disrupts this leg',()=>{
  const db=fixture(),now=at('08:00'),leg=busLeg(db,'first'),result={departure:leg.start,legs:[leg]};
  for(const key of ['first|*|20261019','first|M|20261019']){
    const status=journeyStatus(db,live(now,[[key,{tripRelationship:3}]]),result,now);
    assert.equal(status.legs[0].cancelled,true);assert.equal(status.disrupted,true);
  }
  assert.equal(journeyStatus(db,live(now,[['first|M|20261019',{relationship:1}]]),result,now).disrupted,false);
  for(const stop of ['A','B'])assert.equal(journeyStatus(db,live(now,[[`first|${stop}|20261019`,{relationship:1}]]),result,now).disrupted,true);
});

test('refined final street walk warns when an arrive-by journey exceeds its deadline',()=>{
  const db=fixture(),now=at('08:00'),leg=busLeg(db,'second'),deadline=at('08:45');
  const result={departure:leg.start,legs:[leg,{type:'walk',from:leg.to,to:{lat:42.05,lon:21.4},start:leg.end,end:at('08:42'),walkingMs:120000}]};
  const original=journeyStatus(db,null,result,now,deadline);
  assert.equal(original.deadlineMissed,false);assert.equal(original.latenessMs,0);assert.equal(original.disrupted,false);
  result.legs[1].walkingMs=480000;
  const refined=journeyStatus(db,null,result,now,deadline);
  assert.equal(refined.arrival,at('08:48'));assert.equal(refined.deadlineMissed,true);assert.equal(refined.latenessMs,180000);assert.equal(refined.disrupted,true);
  assert.equal(journeyStatus(db,null,result,now).deadlineMissed,false,'Ordinary journeys have no deadline');
  assert.equal(journeyStatus(db,null,result,now,at('08:48')).deadlineMissed,false,'Arrival at the deadline is on time');
});

test('walking-only arrive-by journeys also use updated duration for lateness',()=>{
  const now=at('08:00'),deadline=at('08:10'),result={departure:now,legs:[{type:'walk',start:now,end:deadline,walkingMs:900000}]};
  const status=journeyStatus({times:new Map()},null,result,now,deadline);
  assert.equal(status.arrival,at('08:15'));assert.equal(status.latenessMs,300000);assert.equal(status.disrupted,true);
});
