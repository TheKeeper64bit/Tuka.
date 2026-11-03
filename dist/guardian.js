// Deterministic Guardian facts. Models never calculate transit feasibility.
import {journeyStatus} from './journey-follow.js?v=28';
import {matchingAlerts,alertText} from './service-alerts.js?v=27';
export const guardianReasons={
 cancelled:'The provider reports a cancelled trip.',skipped:'The provider reports a skipped boarding or exit stop.',
 closed_stop:'An official no-service alert affects a stop on this journey.',official_alert:'An official alert may affect this journey.',
 transfer_risk:'Current estimates leave insufficient time for a transfer.',tight_transfer:'This transfer has less than two minutes of spare time.',
 delay:'A live prediction has moved later than the chosen journey estimate.',deadline:'The current estimate misses your arrival deadline.',
 missing_live:'Live updates are unavailable or stale. This does not mean the bus is cancelled.',scheduled_plan:'This is a scheduled plan; live operation is unconfirmed.',
};
export function assessJourney(db,rt,selected,now=Date.now()){
 const deadline=selected.context?.deadline??(selected.context?.options?.mode==='arrive'?selected.context.time:null),liveMode=!selected.context?.options?.mode||selected.context.options.mode==='now';
 const fresh=!!rt&&Number.isFinite(rt.timestamp)&&now/1000-rt.timestamp<=120&&rt.timestamp<=now/1000+15;
 const status=journeyStatus(db,liveMode?rt:null,selected.result,now,deadline),alerts=matchingAlerts(db,rt,status.legs.slice(selected.step||0),now),reasons=[],excludedTrips=[],closedStops=[];
 const add=(code,source)=>{if(!reasons.some(r=>r.code===code))reasons.push({code,source});};
 for(const [i,leg] of status.legs.entries()){
  if(i<(selected.step||0))continue;
  if(leg.cancelled){add('cancelled','provider report');excludedTrips.push({tripId:leg.tripId,serviceDate:leg.serviceDate});}
  if(leg.skipped){add('skipped','provider report');excludedTrips.push({tripId:leg.tripId,serviceDate:leg.serviceDate});}
  if(leg.connection?.marginMs<0)add('transfer_risk',leg.connection.live?'live prediction':status.legs[i-1]?.arrivalLive||status.legs[i+1]?.live?'mixed live/timetable':'timetable');
  else if(leg.connection?.tight)add('tight_transfer',leg.connection.live?'live prediction':status.legs[i-1]?.arrivalLive||status.legs[i+1]?.live?'mixed live/timetable':'timetable');
  if(leg.type==='bus'&&(leg.live||leg.arrivalLive)&&Math.max(leg.start-selected.result.legs[i].start,leg.end-selected.result.legs[i].end)>=120000)add('delay','live prediction');
 }
 if(status.deadlineMissed)add('deadline',status.live?'live prediction':'timetable');
 for(const alert of alerts){const stops=alert.effect===1?(alert.selectors||[]).filter(s=>s.stop).map(s=>s.stop):[];if(stops.length){add('closed_stop','official alert');closedStops.push(...stops);}else add('official_alert','official alert');}
 if(!liveMode)add('scheduled_plan','timetable');else if(!fresh||!status.live)add('missing_live','missing data');
 const key=JSON.stringify({step:selected.step,reasons:reasons.map(r=>[r.code,r.source]),closed:[...new Set(closedStops)].sort(),excluded:excludedTrips,alerts:alerts.map(a=>alertText(a.title)).sort(),margins:status.legs.filter(l=>l.connection).map(l=>Math.floor(l.connection.marginMs/120000))});
 return {key,status,deadline,reasons,alerts,excludedTrips,closedStops:[...new Set(closedStops)],fresh:liveMode&&fresh,updatedAt:liveMode&&fresh?rt.timestamp*1000:null,checkedAt:now,severity:reasons.some(r=>['cancelled','skipped','closed_stop','transfer_risk','deadline'].includes(r.code))?'warning':reasons.some(r=>!['missing_live','scheduled_plan'].includes(r.code))?'notice':'info'};
}
export const journeyKey=result=>result.legs.filter(l=>l.type==='bus').map(l=>[l.tripId,l.serviceDate,l.boardSeq,l.endSeq].join(':')).join('|')||'walk';
export function guardianAlternatives(db,rt,selected,assessment,plan,from,to,now,options){
 const input={...options,mode:options.mode==='arrive'?'arrive':'now',excludedTrips:[...(selected.context?.excludedTrips||[]),...assessment.excludedTrips],excludedStops:assessment.closedStops};
 const results=plan(db,rt,from,to,input.mode==='arrive'?assessment.deadline:now,input).filter(r=>journeyKey(r)!==journeyKey(selected.result)).filter(r=>!Number.isFinite(assessment.deadline)||r.arrival<=assessment.deadline).filter(r=>!journeyStatus(db,input.mode==='arrive'?null:rt,r,now,assessment.deadline).disrupted);
 return results.slice(0,3).map((result,i)=>({id:'option-'+(i+1),result,key:journeyKey(result)}));
}
export function guardianContext(db,selected,assessment,alternatives,now=Date.now()){
 const status=assessment.status,buses=status.legs.filter(l=>l.type==='bus');
 return {network:db.provider?.startsWith('gtfs-')?'Imported network':db.provider||'Transit network',timezone:db.timezone||'Europe/Skopje',checkedAt:now,updatedAt:assessment.updatedAt,mode:assessment.fresh?'live':'scheduled',
  current:{arrival:status.arrival,deadline:assessment.deadline??null,walkingMeters:Math.round(selected.result.walkingMeters||0),transfers:selected.result.transfers||0},
  // Only public transit stop names; never private pin addresses or coordinates.
  legs:buses.slice(0,8).map(l=>({line:String(l.route?.route_short_name||l.route?.route_long_name||'').slice(0,80),from:String(l.from.stop_name||l.from.name||'').slice(0,100),to:String(l.to.stop_name||l.to.name||'').slice(0,100),departure:l.start,arrival:l.end,live:!!(l.live||l.arrivalLive)})),
  reasons:assessment.reasons.map(r=>r.code),notices:assessment.alerts.slice(0,4).map(a=>({title:alertText(a.title).slice(0,160),description:alertText(a.description).slice(0,500),source:'official',updatedAt:null})),alternatives:alternatives.map(a=>({id:a.id,arrival:a.result.arrival,walkingMeters:Math.round(a.result.walkingMeters||0),transfers:a.result.transfers,feasible:true,avoidsDisruption:!!(assessment.excludedTrips.length||assessment.closedStops.length)&&!a.result.legs.some(l=>l.type==='bus'&&(assessment.closedStops.includes(l.from.id)||assessment.closedStops.includes(l.to.id)||assessment.excludedTrips.some(x=>x.tripId===l.tripId&&x.serviceDate===l.serviceDate)))})),
 };
}
