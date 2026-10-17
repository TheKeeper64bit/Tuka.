import {distance,serviceDay,active,prediction,eventTime} from './schedule.js?v=24';
export function preferences(input={}) {
  const number=(v,f,min,max)=>Number.isFinite(+v)&&v!==''?Math.max(min,Math.min(max,+v)):f;
  return {preference:['fastest','transfers','walking'].includes(input.preference)?input.preference:'fastest',walkingSpeed:number(input.walkingSpeed,4.5,2,6),minTransfer:number(input.minTransfer,3,0,20),mode:['now','leave','arrive'].includes(input.mode)?input.mode:'now'};
}
const HORIZON=4*3600000;
// Keep nondominated time/walking labels in each ride round. A faster but longer
// walk must not erase a useful low-walking option at the same stop.
function retain(map,id,label) {
  const current=map.get(id)||[];
  if(current.some(x=>x.time<=label.time&&x.walk<=label.walk)) return;
  map.set(id,[...current.filter(x=>!(label.time<=x.time&&label.walk<=x.walk)),label]);
}
export function planJourney(db,rt,origin,destination,time=Date.now(),input={}) {
  const options=preferences(input),reverse=options.mode==='arrive',sign=reverse?-1:1,start=sign*time;
  // Only Leave now uses live updates. Dated plans remain reproducible timetable predictions.
  const live=options.mode==='now'?rt:null,buffer=options.minTransfer*60000;
  const walked=(m,from,to)=>input.walkingDistance?.(reverse?to:from,reverse?from:to)??m*1.3;
  const walkMs=(m,from,to)=>Math.ceil(walked(m,from,to)/(options.walkingSpeed*1000/3600))*1000;
  const stops=db.stops.filter(s=>db.byStop.has(s.id)),byId=new Map(stops.map(s=>[s.id,s]));
  const source=reverse?destination:origin,target=reverse?origin:destination;
  const foot=(type,from,to,meters,at)=>{const walkingMs=walkMs(meters,from,to),end=at+walkingMs+(type==='transfer'?buffer:0);return {type,from:reverse?to:from,to:reverse?from:to,meters,walkingMeters:walked(meters,from,to),walkingMs,bufferMs:type==='transfer'?buffer:0,start:reverse?-end:at,end:reverse?-at:end};};
  let labels=new Map(),results=[];
  for(const s of stops) {const meters=distance(source,s);if(meters<=800){const leg=foot('walk',source,s,meters,start);retain(labels,s.id,{time:reverse?-leg.start:leg.end,walk:leg.walkingMeters,legs:[leg]});}}
  const egress=new Map(stops.map(s=>[s.id,distance(s,target)]).filter(x=>x[1]<=800));
  const finish=legs=>{legs=(reverse?legs.slice().reverse():legs).map(l=>({...l}));if(reverse){for(let i=1;i<legs.length;i++){const leg=legs[i];if(leg.type!=='bus'){leg.start=legs[i-1].end;leg.end=leg.start+leg.walkingMs+leg.bufferMs;}}}const buses=legs.filter(l=>l.type==='bus');results.push({departure:legs[0].start,arrival:legs.at(-1).end,legs,transfers:Math.max(0,buses.length-1),walkingMeters:Math.round(legs.filter(l=>l.type!=='bus').reduce((n,l)=>n+l.walkingMeters,0))});};
  const direct=distance(source,target);if(direct<=1800)finish([foot('walk',source,target,direct,start)]);
  const runs=[];
  // Include extended service from previous days, and the following civil day.
  const maxSeconds=[...db.times.values()].reduce((n,path)=>Math.max(n,path.at(-1)?.seconds||0),86400);
  const lookback=Math.ceil(maxSeconds/86400);
  for(let offset=-lookback;offset<=1;offset++) {
    const day=serviceDay(offset,time),services=active(db,day);
    for(const [id,trip] of db.trips) {
      if(!services.has(trip.service_id)||(input.excludedTrips||[]).some(x=>x.tripId===id&&x.serviceDate===day.date))continue;
      let cancelled=false,prev=-Infinity,prevLive=false;
      const timed=(db.times.get(id)||[]).map(p=>{
        const u=prediction(live,id,p.stop_id,day,time);if(u?.tripRelationship===3)cancelled=true;
        const arrival=eventTime(u,'arrival',day.midnight+(p.arrivalSeconds??p.seconds)*1000),departure=eventTime(u,'departure',day.midnight+p.seconds*1000);
        if(arrival.time<prev){arrival.time=prev;arrival.live ||= prevLive;}if(departure.time<arrival.time){departure.time=arrival.time;departure.live ||= arrival.live;}prev=departure.time;prevLive=departure.live;
        return {p,arrival,departure,skip:u?.relationship===1};
      });
      if(cancelled||timed.length<2)continue;
      const path=reverse?timed.reverse():timed;
      if(sign*(reverse?path.at(-1).departure.time:path.at(-1).arrival.time)<start||sign*(reverse?path[0].arrival.time:path[0].departure.time)>start+HORIZON)continue;
      runs.push({id,trip,day,path});
    }
  }
  for(let round=0;round<3;round++) {
    const reached=new Map();
    for(const run of runs) {
      let boarded=[];
      for(let i=0;i<run.path.length;i++) {
        const x=run.path[i];if(x.skip||!byId.has(x.p.stop_id))continue;
        const arrive=sign*(reverse?x.departure.time:x.arrival.time),depart=sign*(reverse?x.arrival.time:x.departure.time);
        if(x.p[reverse?'pickup_type':'drop_off_type']!=='1'&&arrive<=start+HORIZON) for(const b of boarded) {
          const first=reverse?x:b.x,last=reverse?b.x:x;
          const leg={type:'bus',route:db.routes.get(run.trip.route_id),headsign:run.trip.trip_headsign,tripId:run.id,serviceDate:run.day.date,boardSeq:first.p.seq,endSeq:last.p.seq,from:byId.get(first.p.stop_id),to:byId.get(last.p.stop_id),start:first.departure.time,end:last.arrival.time,live:first.departure.live,arrivalLive:last.arrival.live,stops:i-b.index};
          retain(reached,x.p.stop_id,{time:arrive,walk:b.label.walk,legs:[...b.label.legs,leg]});
        }
        if(x.p[reverse?'drop_off_type':'pickup_type']==='1'||depart<start)continue;
        for(const label of labels.get(x.p.stop_id)||[]) if(label.time<=depart&&!label.legs.some(l=>l.tripId===run.id&&l.serviceDate===run.day.date)) {
          // Once aboard the same run, lower walking cost dominates at all later stops.
          if(!boarded.some(b=>b.label.walk<=label.walk))boarded=[{label,x,index:i}];
        }
      }
    }
    for(const [id,entries] of reached) for(const label of entries) {
      const meters=egress.get(id);if(meters!=null&&label.time+walkMs(meters,byId.get(id),target)<=start+HORIZON)finish([...label.legs,foot('walk',byId.get(id),target,meters,label.time)]);
    }
    if(round===2)break;
    const next=new Map();db.walkTransfers??=new Map();
    for(const [id,entries] of reached) {
      let neighbors=db.walkTransfers.get(id);
      if(!neighbors){neighbors=stops.map(s=>({s,dist:distance(byId.get(id),s)})).filter(x=>x.dist<=250);db.walkTransfers.set(id,neighbors);}
      for(const label of entries) for(const x of neighbors) retain(next,x.s.id,{time:label.time+walkMs(x.dist,byId.get(id),x.s)+buffer,walk:label.walk+walked(x.dist,byId.get(id),x.s),legs:[...label.legs,foot('transfer',byId.get(id),x.s,x.dist,label.time)]});
    }
    labels=next;
  }
  for(const r of results) {
    r.connections=[];
    r.legs.forEach((leg,i)=>{if(leg.type!=='transfer')return;const before=r.legs[i-1],after=r.legs[i+1];if(before?.type!=='bus'||after?.type!=='bus')return;const availableMs=after.start-before.end,marginMs=availableMs-leg.walkingMs-buffer;const connection={availableMs,walkingMs:leg.walkingMs,bufferMs:buffer,marginMs,tight:marginMs<120000,live:before.arrivalLive&&after.live};leg.connection=connection;r.connections.push(connection);});
    r.tight=r.connections.some(c=>c.tight);
  }
  const timing=(a,b)=>reverse?b.departure-a.departure:a.arrival-b.arrival;
  const compare=options.preference==='transfers'?(a,b)=>a.transfers-b.transfers||timing(a,b)||a.walkingMeters-b.walkingMeters:options.preference==='walking'?(a,b)=>a.walkingMeters-b.walkingMeters||timing(a,b)||a.transfers-b.transfers:(a,b)=>timing(a,b)||a.transfers-b.transfers||a.walkingMeters-b.walkingMeters;
  const seen=new Set(),unique=results.sort(compare).filter(r=>{const key=r.legs.filter(l=>l.type==='bus').map(l=>`${l.tripId}:${l.serviceDate}:${l.from.id}:${l.to.id}`).join('|')||'walk';if(seen.has(key))return false;seen.add(key);return true;});
  const dominates=(a,b)=>timing(a,b)<=0&&a.transfers<=b.transfers&&a.walkingMeters<=b.walkingMeters;
  let ranked=[];
  for(const r of unique){if(ranked.some(x=>dominates(x,r)))continue;ranked=ranked.filter(x=>!dominates(r,x));ranked.push(r);}
  ranked.sort(compare);
  const selected=ranked.slice(0,5);
  if(selected[0]?.tight){const simpler=ranked.find(r=>!r.tight&&r.transfers<selected[0].transfers);if(simpler&&!selected.includes(simpler))selected[selected.length-1]=simpler;}
  return selected;
}
