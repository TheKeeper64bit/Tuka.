export const ZONE = 'Europe/Skopje';
const dateFormat = new Intl.DateTimeFormat('en-CA', {timeZone: ZONE, year:'numeric', month:'2-digit', day:'2-digit'});
const timeFormat = new Intl.DateTimeFormat('en-GB', {timeZone: ZONE, hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
export function localDate(time=Date.now()) { const p=Object.fromEntries(dateFormat.formatToParts(time).map(p=>[p.type,p.value])); return `${p.year}-${p.month}-${p.day}`; }
export const localTime = time => timeFormat.format(time);
// Resolve wall-clock input in the agency zone, independently of the device zone.
// Reject missing spring-forward times; use the first occurrence of an autumn overlap.
export function localTimestamp(date, time='12:00') {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time)) return NaN;
  const base=Date.parse(`${date}T${time}:00Z`);
  for(const offset of [2,1]) { const t=base-offset*3600000; if(localDate(t)===date&&localTime(t)===time) return t; }
  return NaN;
}
export function serviceDay(offset=0, reference=Date.now()) {
  const date=typeof reference==='string'?reference:localDate(reference);
  const d=new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+offset);
  const iso=d.toISOString().slice(0,10);
  // GTFS times are elapsed seconds from local noon minus 12 hours (also on DST days).
  return {date:iso.replaceAll('-',''),iso,weekday:['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][d.getUTCDay()],midnight:localTimestamp(iso)-43200000};
}
export function active(db,day) {
  const ids=new Set((db.calendar||[]).filter(c=>c.start_date<=day.date&&c.end_date>=day.date&&c[day.weekday]==='1').map(c=>c.service_id));
  for(const e of db.exceptions||[]) if(e.date===day.date) { if(e.exception_type==='1') ids.add(e.service_id); else ids.delete(e.service_id); }
  return ids;
}
let predictionMinute, predictionDate;
export function prediction(rt,tripId,stopId,day,queryTime,now=Date.now()) {
  if(!rt?.updates?.size||Math.abs(now/1000-rt.timestamp)>=120||Math.abs(queryTime-now)>=120000) return null;
  const minute=Math.floor(now/60000);if(predictionMinute!==minute){predictionMinute=minute;predictionDate=serviceDay(0,now).date;}
  const cancelled=rt.updates.get(`${tripId}|*|${day.date}`)||(day.date===predictionDate?rt.updates.get(`${tripId}|*|`):null);if(cancelled)return cancelled;
  // Undated updates cannot safely identify yesterday's extended service or tomorrow's trip.
  return rt.updates?.get(`${tripId}|${stopId}|${day.date}`) || (day.date===predictionDate?rt.updates?.get(`${tripId}|${stopId}|`):null);
}
export function eventTime(update,kind,scheduled) {
  const event=update&&('arrival' in update||'departure' in update)?update[kind]:update;
  const live=event?.time!=null||event?.delay!=null;
  return {time:event?.time!=null?event.time*1000:scheduled+(event?.delay??0)*1000,live};
}
export const distance=(a,b)=>{const r=Math.PI/180,x=(b.lat-a.lat)*r,y=(b.lon-a.lon)*r;return 6371000*2*Math.asin(Math.sqrt(Math.sin(x/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(y/2)**2));};

export function hasPublishedService(db,time,mode='leave'){
  const start=mode==='arrive'?time-4*3600000:time,end=mode==='arrive'?time:time+4*3600000;
  const maxSeconds=[...db.times.values()].reduce((n,path)=>Math.max(n,path.at(-1)?.seconds||0),86400);
  for(let offset=-Math.ceil(maxSeconds/86400);offset<=1;offset++){
    const day=serviceDay(offset,time),ids=active(db,day);
    for(const [id,trip] of db.trips){if(!ids.has(trip.service_id))continue;const path=db.times.get(id);if(path?.length&&day.midnight+path.at(-1).seconds*1000>=start&&day.midnight+path[0].seconds*1000<end)return true;}
  }
  return false;
}
