import {active,serviceDay,prediction,eventTime} from './schedule.js?v=24';
const first=(f,k)=>f[k]?.[0];
const string=b=>b?new TextDecoder().decode(b):'';
// Field numbers follow the GTFS Realtime Alert/EntitySelector specification.
export function decodeAlert(raw,fields){
  const f=fields(raw),text=k=>(f[k]||[]).flatMap(b=>(fields(b)[1]||[]).map(t=>{const v=fields(t);return {text:string(first(v,1)),language:string(first(v,2))};}));
  const ranges=k=>(f[k]||[]).map(b=>{const v=fields(b);return {start:first(v,1),end:first(v,2)};});
  return {periods:ranges(3).length?ranges(3):ranges(1),communication:ranges(2),title:text(10),description:text(11),url:text(8),selectors:(f[5]||[]).map(b=>{
    const v=fields(b),t=first(v,4)?fields(first(v,4)):{};
    return {agency:string(first(v,1)),route:string(first(v,2)),routeType:first(v,3),stop:string(first(v,5)),direction:first(v,6),trip:string(first(t,1)),date:string(first(t,3)),tripRoute:string(first(t,5)),tripDirection:first(t,6),startTime:string(first(t,2))};
  })};
}
export function alertText(values,locale='en'){return (values?.find(t=>(t.language||'').split('-')[0]===locale)||values?.find(t=>t.language==='en')||values?.find(t=>!t.language)||values?.[0])?.text||'';}
export function safeLink(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
const freshAlerts=(rt,now)=>rt?.alerts&&Number.isFinite(rt.alertTimestamp)&&now/1000-rt.alertTimestamp<=120&&rt.alertTimestamp<=now/1000+15?rt.alerts:[];
const affected=(periods,start,end)=>!periods?.length||periods.some(p=>(p.start??-Infinity)<=end/1000&&(p.end??Infinity)>start/1000);
function matches(s,{route={},trip={},stopIds=[],tripId,date,startTime}){
  const specified=s.agency||s.route||s.stop||s.trip||s.routeType!=null||s.direction!=null||s.tripRoute;
  return specified&&(!s.agency||s.agency===route.agency_id)&&(!s.route||s.route===route.route_id)&&(s.routeType==null||String(s.routeType)===String(route.route_type))&&(!s.stop||stopIds.includes(s.stop))&&(s.direction==null||String(s.direction)===String(trip.direction_id))&&(!s.trip||s.trip===tripId)&&(!s.date||s.date===date)&&(!s.tripRoute||s.tripRoute===route.route_id)&&(s.tripDirection==null||String(s.tripDirection)===String(trip.direction_id))&&(!s.startTime||s.startTime===startTime);
}
export function matchingAlerts(db,rt,legs,now=Date.now()){
  return freshAlerts(rt,now).filter(a=>legs.some(l=>l.type==='bus'&&affected(a.periods,l.start,l.end)&&a.selectors.some(s=>matches(s,{
    route:l.route,trip:db.trips.get(l.tripId),tripId:l.tripId,date:l.serviceDate,startTime:db.times.get(l.tripId)?.[0]?.departure_time,
    stopIds:(db.times.get(l.tripId)||[]).filter(c=>c.seq>=l.boardSeq&&c.seq<=l.endSeq).map(c=>c.stop_id)
  }))));
}

// A closure must remain visible when the live departure list becomes empty.
// Match stop/route alerts directly, and use current trip instances for selectors
// that identify a particular trip. Cancelled/skipped calls retain their schedule.
export function matchingStopAlerts(db,rt,stopId,routeIds,now=Date.now()){
  const selected=routeIds==null?null:new Set(routeIds),calls=db.byStop?.get(stopId)||[],contexts=[],instances=[],days=new Map();
  for(const call of calls){
    const trip=db.trips.get(call.trip_id);if(!trip||selected&&!selected.has(trip.route_id))continue;
    const route=db.routes.get(trip.route_id);if(!route)continue;
    const context={route,trip,tripId:call.trip_id,startTime:db.times.get(call.trip_id)?.[0]?.departure_time,stopIds:[stopId]};
    contexts.push(context);
    if(!Number.isFinite(call.seconds))continue;
    for(let offset=-Math.ceil(call.seconds/86400);offset<=1;offset++){
      if(!days.has(offset)){const day=serviceDay(offset,now);days.set(offset,{day,services:active(db,day)});}
      const {day,services}=days.get(offset);if(!services.has(trip.service_id))continue;
      const scheduled=day.midnight+call.seconds*1000,update=prediction(rt,call.trip_id,stopId,day,now,now);
      const estimated=eventTime(update,'departure',scheduled).time;
      const times=update?.tripRelationship===3||update?.relationship===1?new Set([scheduled,estimated]):[estimated];
      for(const time of times){
        if(time<now-20000||time>now+4*3600000)continue;
        instances.push({...context,date:day.date,time});
      }
    }
  }
  return freshAlerts(rt,now).filter(a=>a.selectors.some(s=>{
    if(s.trip||s.date||s.startTime)return instances.some(c=>affected(a.periods,c.time,c.time)&&matches(s,c));
    if(affected(a.periods,now,now)&&(matches(s,{stopIds:[stopId]})||contexts.some(c=>matches(s,c))))return true;
    return instances.some(c=>affected(a.periods,c.time,c.time)&&matches(s,c));
  }));
}
