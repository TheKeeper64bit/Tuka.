import {preferences} from './planner.js?v=24';
const KEY='tuka-journeys-v1';
const point=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
export function readJourneys(storage) {
  try {const rows=JSON.parse(storage.getItem(KEY)||'[]');return Array.isArray(rows)?rows.filter(r=>typeof r.id==='string'&&point(r.origin)&&point(r.destination)&&Array.isArray(r.routes)).slice(0,30).map(r=>({...r,label:String(r.label||'Saved journey').slice(0,100),options:preferences({...r.options,mode:'now'})})):[];}catch{return [];}
}
export function writeJourneys(storage,rows){storage.setItem(KEY,JSON.stringify(rows.slice(0,30)));}
export function journeyPattern(result){return result.legs.filter(l=>l.type==='bus').map(l=>`${l.route.route_id}:${l.from.id}:${l.to.id}`);}
export function savedJourney(origin,destination,options,result,label) {
  const copy=p=>({lat:p.lat,lon:p.lon,name:p.name||p.stop_name||'Pinned location'});
  return {id:globalThis.crypto.randomUUID(),label:label.slice(0,100),origin:copy(origin),destination:copy(destination),options:preferences({...options,mode:'now'}),routes:journeyPattern(result),savedAt:Date.now()};
}
export function commuteStatus(saved,results) {
  if(!results.length)return {text:'No journey found in the next 4 hours. Check the service date and timetable.',kind:'warning'};
  const match=results.find(r=>JSON.stringify(journeyPattern(r))===JSON.stringify(saved.routes));
  if(!match)return {text:'A different route is suggested. Open the planner to review it.',kind:'warning'};
  if(match.tight)return {text:'Tight connection on this journey. Review the transfer margin.',kind:'warning',result:match};
  const buses=match.legs.filter(l=>l.type==='bus');
  return {text:buses.length&&buses.every(l=>l.live&&l.arrivalLive)?'Fresh estimates available for each bus. Connections are still estimates.':'Timetable journey available. Live coverage is incomplete; normal service is unconfirmed.',kind:'info',result:match};
}
