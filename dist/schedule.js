export const ZONE = 'Europe/Skopje';
const formats = new Map();
function formatter(zone=ZONE) {
  if(!formats.has(zone)) formats.set(zone,{date:new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}),time:new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}),offset:new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'shortOffset',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})});
  return formats.get(zone);
}
export function localDate(time=Date.now(),zone=ZONE) { const p=Object.fromEntries(formatter(zone).date.formatToParts(time).map(p=>[p.type,p.value])); return `${p.year}-${p.month}-${p.day}`; }
export const localTime = (time=Date.now(),zone=ZONE) => formatter(zone).time.format(time);
function offsetMs(time,zone=ZONE){const part=formatter(zone).offset.formatToParts(time).find(p=>p.type==='timeZoneName')?.value||'GMT';if(part==='GMT'||part==='UTC')return 0;const m=part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);if(!m)return 0;return (m[1]==='-'?-1:1)*(+m[2]*60+(+(m[3]||0)))*60000;}
// Resolve wall-clock input in the agency zone, independently of the device zone.
// Reject missing spring-forward times; use the first occurrence of an autumn overlap.
export function localTimestamp(date, time='12:00',zone=ZONE) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time)) return NaN;
  const base=Date.parse(`${date}T${time}:00Z`),matches=[];
  if(!Number.isFinite(base))return NaN;
  // Sample offsets on both sides of DST, then verify wall-clock round trips.
  const offsets=new Set([-2,-1,0,1,2].map(d=>offsetMs(base+d*86400000,zone)));
  for(const offset of offsets){const t=base-offset;if(localDate(t,zone)===date&&localTime(t,zone)===time)matches.push(t);}
  return matches.length?Math.min(...matches):NaN;
}
export function serviceDay(offset=0, reference=Date.now(),zone=ZONE) {
  const date=typeof reference==='string'?reference:localDate(reference,zone);
  const d=new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+offset);
  const iso=d.toISOString().slice(0,10);
  // GTFS times are elapsed seconds from local noon minus 12 hours (also on DST days).
  return {date:iso.replaceAll('-',''),iso,weekday:['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][d.getUTCDay()],midnight:localTimestamp(iso,'12:00',zone)-43200000,timezone:zone};
}
export function active(db,day) {
  const ids=new Set((db.calendar||[]).filter(c=>c.start_date<=day.date&&c.end_date>=day.date&&c[day.weekday]==='1').map(c=>c.service_id));
  for(const e of db.exceptions||[]) if(e.date===day.date) { if(e.exception_type==='1') ids.add(e.service_id); else ids.delete(e.service_id); }
  return ids;
}
const predictionDates=new Map();
export function prediction(rt,tripId,stopId,day,queryTime,now=Date.now(),zone=day?.timezone||ZONE,seq) {
  if(!rt?.updates?.size||(!Number.isFinite(rt.timestamp)||now/1000-rt.timestamp>=120||rt.timestamp>now/1000+15)||Math.abs(queryTime-now)>=120000) return null;
  const minute=Math.floor(now/60000),cached=predictionDates.get(zone);
  const predictionDate=cached?.minute===minute?cached.date:localDate(now,zone).replaceAll('-','');
  predictionDates.set(zone,{minute,date:predictionDate});
  const dates=day.date===predictionDate?[day.date,'']:[day.date];
  for(const date of dates){const cancelled=rt.updates.get(`${tripId}|*|${date}`);if(cancelled)return cancelled;}
  for(const date of dates){
    if(seq!=null){const exact=rt.updates.get(`${tripId}|${stopId}|${date}|${seq}`);if(exact)return exact;}
    const value=rt.updates.get(`${tripId}|${stopId}|${date}`);
    if(value&&(seq==null||value.seq==null||value.seq===seq))return value;
  }
  return null;
}
export function eventTime(update,kind,scheduled) {
  const event=update&&('arrival' in update||'departure' in update)?update[kind]:update;
  const live=event?.time!=null||event?.delay!=null;
  return {time:event?.time!=null?event.time*1000:scheduled+(event?.delay??0)*1000,live};
}
export const distance=(a,b)=>{const r=Math.PI/180,x=(b.lat-a.lat)*r,y=(b.lon-a.lon)*r;return 6371000*2*Math.asin(Math.sqrt(Math.sin(x/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(y/2)**2));};

export function hasPublishedService(db,time,mode='leave',zone=db?.timezone||ZONE){
  const start=mode==='arrive'?time-4*3600000:time,end=mode==='arrive'?time:time+4*3600000;
  const maxSeconds=db.maxSeconds??[...db.times.values()].reduce((n,path)=>Math.max(n,path.at(-1)?.seconds||0),86400);
  for(let offset=-Math.ceil(maxSeconds/86400);offset<=1;offset++){
    const day=serviceDay(offset,time,zone),ids=active(db,day);
    for(const [id,trip] of db.trips){if(!ids.has(trip.service_id))continue;const path=db.times.get(id);if(path?.length&&day.midnight+path.at(-1).seconds*1000>=start&&day.midnight+path[0].seconds*1000<end)return true;}
  }
  return false;
}
