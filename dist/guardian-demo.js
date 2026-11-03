import {load,normalizeRealtime} from './transit.js?v=27';
import {planJourney} from './planner.js?v=27';
import {journeyGeometry,journeyOverlay} from './journey-follow.js?v=28';
import {assessJourney,guardianAlternatives,guardianContext} from './guardian.js?v=1';
import {guardianMarkup} from './guardian-view.js?v=1';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let db,event,baseline,selected,rt=null,state={},map,now,from,to;
const clock=t=>new Intl.DateTimeFormat('en-GB',{timeZone:db.timezone,hour:'2-digit',minute:'2-digit'}).format(t);
function draw(){const a=assessJourney(db,rt,selected,now);$('#demo-guardian').innerHTML=guardianMarkup(a,state,clock);$('#demo-steps').innerHTML=selected.result.legs.map(l=>`<li>${l.type==='bus'?'Bus '+esc(l.route.route_short_name):l.type==='transfer'?'Transfer':'Walk'} · ${esc(l.from.name)} → ${esc(l.to.name)} · ${clock(l.start)}–${clock(l.end)}</li>`).join('');if(map?.isStyleLoaded()){const g=journeyGeometry(db,selected.result);journeyOverlay(map,g,0);const points=g.paths.features.flatMap(f=>f.geometry.coordinates),bounds=new maplibregl.LngLatBounds(points[0],points[0]);points.forEach(p=>bounds.extend(p));map.fitBounds(bounds,{padding:35,maxZoom:15,duration:0});}}
try{
 event=await (await fetch('./guardian-replay.json')).json();db=await load({cityId:'boston'});now=event.timestamp*1000;from=db.stopIndex.get(event.candidate.from.id);to=db.stopIndex.get(event.candidate.to.id);
 const selectedOnly={...db,trips:new Map([[event.candidate.tripId,db.trips.get(event.candidate.tripId)]])};baseline=planJourney(selectedOnly,null,from,to,now,{mode:'now'}).find(r=>r.legs.some(l=>l.tripId===event.candidate.tripId));if(!baseline)throw Error('The captured trip no longer matches this snapshot.');selected={result:baseline,step:0,context:{options:{mode:'now'},time:now,deadline:null}};
 $('#demo-source').textContent='Source: MBTA GTFS-Realtime · captured '+event.capturedAt+' · bus '+event.candidate.route.route_short_name+' · observed departure prediction '+Math.round(event.candidate.delayMs/1000)+' seconds later than the stored timetable.';
 $('#demo-replay').disabled=false;$('#demo-reset').disabled=false;
 map=new maplibregl.Map({container:'demo-map',style:'https://tiles.openfreemap.org/styles/liberty',center:[from.lon,from.lat],zoom:13});map.on('load',draw);draw();
 $('#demo-replay').onclick=()=>{rt=normalizeRealtime({timestamp:event.timestamp,alertTimestamp:event.timestamp,updates:new Map(event.candidate.updates),vehicles:[],alerts:[]},db,now);state={open:true};$('#demo-events').textContent='Captured provider predictions applied. Compare alternatives locally; then optionally request an AI explanation.';draw();};
 $('#demo-reset').onclick=()=>{selected={result:baseline,step:0,context:{options:{mode:'now'},time:now,deadline:null}};rt=null;state={};$('#demo-events').textContent='Replay reset. This is the selected scheduled journey before the captured update.';draw();};
 document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const a=assessJourney(db,rt,selected,now);
 if(b.hasAttribute('data-guardian-dismiss')){state.dismissed=a.key;draw();return;}if(b.hasAttribute('data-guardian-restore')){state.dismissed=null;state.open=true;draw();return;}
 if(b.hasAttribute('data-guardian-choose')){const x=state.alternatives?.find(x=>x.id===b.dataset.guardianChoose);if(x){selected={result:x.result,step:0,context:{options:{mode:'now'},time:now,deadline:null}};state={open:true,message:'A real planner alternative is now shown on the map.'};draw();}return;}
 if(!b.hasAttribute('data-guardian-analyze')&&!b.hasAttribute('data-guardian-explain'))return;
 state.busy=true;state.open=true;draw();await new Promise(r=>setTimeout(r,25));try{
 state.alternatives=guardianAlternatives(db,rt,selected,a,planJourney,from,to,now,{mode:'now'});state.key=a.key;state.at=Date.now();state.message='Historical alternatives calculated by Tuka from the retained timetable and captured prediction.';
 if(b.hasAttribute('data-guardian-explain')){const context={...guardianContext(db,selected,a,state.alternatives,now),mode:'replay'};const response=await fetch('./api/meta/guardian',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({context,question:'Explain the trade-offs for this clearly labeled historical event replay.'})});const data=await response.json();if(!response.ok)throw Error(data.error||'AI is unavailable. Local alternatives remain available.');state.decision=data.decision;state.provider=data.provider;}
 }catch(error){state.message=error.message;}finally{state.busy=false;draw();}
 });
}catch(error){$('#demo-source').textContent='Replay could not open: '+error.message;}
