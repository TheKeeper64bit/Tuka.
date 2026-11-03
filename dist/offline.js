import {restoreImportedFeeds} from './feed-store.js?v=1';
await restoreImportedFeeds().catch(()=>{});
import {cityStorage} from './gtfs.js?v=2';
import {providerFor} from './city-providers.js?v=3';
import {load,departures,planJourney} from './transit.js?v=27';
import {localDate,localTime,localTimestamp,hasPublishedService} from './schedule.js?v=24';
import {readFavourites,savedRouteMatches} from './favourites.js?v=20';
import {readJourneys} from './journey-store.js?v=24';
const cityId=providerFor(new URL(location.href).searchParams.get('city')||localStorage.getItem('tuka-meta-city')||'skopje').id,storage=cityStorage(localStorage,cityId);
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when=t=>localTime(t,db?.timezone)+' · '+localDate(t,db?.timezone);
if(localStorage.getItem('tuka-dark')==='1')document.body.classList.add('dark');
$('offline-date').value=localDate();$('offline-time').value=localTime(Date.now());
let db;
function render(){
  const time=localTimestamp($('offline-date').value,$('offline-time').value,db?.timezone);
  if(!Number.isFinite(time)){$('offline-info').textContent=`Choose a valid date and time in ${db?.timezone||'the selected city'}.`;return;}
  $('offline-info').textContent=hasPublishedService(db,time)?scheduleInfo():'No bus trips are published for the selected time window in the downloaded timetable. Reconnect closer to travel to get an updated feed. Walking options may still be available.';
  const favourites=readFavourites(storage),commutes=readJourneys(storage);
  $('offline-journeys').innerHTML=commutes.length?commutes.map((c,i)=>`<article><h3>${esc(c.label)}</h3><p>${esc(c.origin.name)} → ${esc(c.destination.name)}</p><button data-plan="${i}">Check downloaded timetable</button><div id="offline-result-${i}" role="status"></div></article>`).join(''):'<p>Save a commute from a journey result while using Tuka.</p>';
  $('offline-stops').innerHTML=[...favourites].map(([id,filters])=>{
    const stop=db.stops.find(s=>s.id===id);if(!stop)return '<article>Saved stop is no longer in this downloaded timetable.</article>';
    const list=departures(db,null,id,time,2000,{horizonHours:24}).filter(a=>savedRouteMatches(filters,a.trip.route_id)&&(!filters.targetStopId||(db.times.get(a.trip.trip_id)||[]).some(p=>p.seq>a.s.seq&&p.stop_id===filters.targetStopId)));
    const rows=list.map(a=>`<li><strong>${esc(a.route.route_short_name)}</strong><span>${esc(a.trip.trip_headsign)}<small>${a.trip.frequencyEstimated?'Frequency estimate':'Scheduled'} · ${when(a.time)}</small></span></li>`);
    return `<article><h3>${esc(stop.name)}</h3><p>${filters.routeIds===null?'All routes':filters.routeIds.length?'Saved route filters':'No routes selected'} · next 24 hours</p><ul>${rows.slice(0,6).join('')}</ul>${rows.length>6?`<details><summary>View full timetable (${rows.length} departures)</summary><ul>${rows.slice(6).join('')}</ul></details>`:rows.length?'':'<p>No scheduled departures for this selection.</p>'}</article>`;
  }).join('')||'<p>Your saved stops and route filters will appear here.</p>';
  $('offline-journeys').onclick=e=>{const b=e.target.closest('button[data-plan]');if(!b)return;const i=Number(b.dataset.plan),c=commutes[i],r=planJourney(db,null,c.origin,c.destination,time,{...c.options,mode:'leave'})[0];$('offline-result-'+i).innerHTML=r?`<p><strong>Timetable prediction · arrive ~${when(r.arrival)}</strong><br>${r.transfers} transfers · ~${r.walkingMeters} m walking${r.tight?' · Tight connection':''}</p><ol>${r.legs.filter(l=>l.type==='bus').map(l=>`<li>Bus ${esc(l.route.route_short_name)} · ${esc(l.from.name)} ${when(l.start)} → ${esc(l.to.name)} ~${when(l.end)}</li>`).join('')||'<li>Walk to your destination</li>'}</ol><p>Connections and normal service are unconfirmed offline.</p>`:'<p>No journey found in the downloaded timetable within four hours. It may be out of date.</p>';};
}
function scheduleInfo(){return `Downloaded timetable${db.downloadedAt?' · '+localDate(Date.parse(db.downloadedAt),db.timezone):''}. Times are in ${db.timezone||'the selected city'}. Some dates may have no published trips; reconnect to refresh.`;}
try{db=await load({offlineOnly:true,cityId});$('offline-date').value=localDate(Date.now(),db.timezone);$('offline-time').value=localTime(Date.now(),db.timezone);$('offline-info').textContent=scheduleInfo();render();$('offline-update').onclick=render;}catch{$('offline-info').textContent='No downloaded schedule is available yet. Open Tuka online and let the timetable finish loading first.';$('offline-update').disabled=true;}
