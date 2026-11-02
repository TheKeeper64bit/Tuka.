import {polishHeader} from './header.js?v=1';
import {providers,providerFor} from './city-providers.js?v=3';
import {restoreImportedFeeds} from './feed-store.js?v=1';
import {reviewFeed,importReviewedFeed,removeImportedFeed} from './feed-import.js?v=1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function initNetworkPicker(document){
 if(document.querySelector('#city-open'))return;
 document.body.classList.add('has-city-picker');
 const button=document.createElement('button');button.id='city-open';button.className='install-app';button.type='button';button.textContent='Choose city';button.setAttribute('aria-label','Choose or import a transit network');document.querySelector('.headtools')?.prepend(button);
 const dialog=document.createElement('dialog');dialog.id='city-picker';dialog.className='network-dialog';dialog.setAttribute('aria-labelledby','network-picker-title');
 dialog.innerHTML='<form method="dialog" class="network-dialog-head"><div><span class="eyebrow">YOUR LOCAL NETWORK</span><h2 id="network-picker-title">Your city. Your network.</h2><p>Choose a network or bring your own GTFS timetable.</p></div><button class="secondary" aria-label="Close network selection">×</button></form><button type="button" class="secondary" id="city-use-location">Use my location</button><p class="notice" id="city-picker-status" role="status">Networks and saved places stay separate on this device.</p><div id="city-picker-list" class="network-list"></div><section class="network-import"><h3>Import a network</h3><p>Upload a public GTFS Schedule ZIP. Tuka reads its agencies, stops, routes, shapes and timetable. The file stays on this device.</p><form id="network-import-form"><label>Network name <span>(optional)</span><input id="network-name" maxlength="80" placeholder="e.g. My city transit"></label><label>GTFS ZIP <input id="network-file" type="file" accept=".zip,application/zip" required></label><small>Up to 50 MB compressed / 200 MB expanded. Regional feeds may need a smaller export.</small><button type="submit" class="secondary" id="network-review">Review timetable</button></form><div id="network-review-result" aria-live="polite"></div></section>';
 document.body.append(dialog);polishHeader(document);const $=s=>dialog.querySelector(s),status=$('#city-picker-status');let pending=null,busy=false,loading=null;
 function render(){const selected=localStorage.getItem('tuka-meta-city');$('#city-picker-list').innerHTML=providers().map(p=>'<div class="network-row"><button type="button" data-city-id="'+esc(p.id)+'" aria-pressed="'+(p.id===selected)+'"><strong>'+esc(p.name)+'</strong><span>'+esc(p.label)+' · '+esc(p.timezone)+'</span><small>'+esc(p.imported?'Imported · timetable only':'Connected network')+'</small></button>'+(p.imported?'<button type="button" class="textbtn" data-remove-network="'+esc(p.id)+'" aria-label="Remove '+esc(p.name)+' timetable">Remove</button>':'')+'</div>').join('');}
 button.onclick=async()=>{if(!dialog.open)dialog.showModal();try{await restoreImportedFeeds();render();}catch{status.textContent='Imported timetables could not be restored. Browser storage may be unavailable.';render();}};
 $('#city-use-location').onclick=()=>{status.textContent='Finding an installed network at your location…';document.dispatchEvent(new CustomEvent('tuka-use-location'));};
 $('#city-picker-list').onclick=async event=>{
  const choose=event.target.closest('[data-city-id]'),remove=event.target.closest('[data-remove-network]');
  if(choose){status.textContent='Loading the selected timetable…';document.dispatchEvent(new CustomEvent('tuka-test-city',{detail:{cityId:choose.dataset.cityId}}));}
  if(remove){const id=remove.dataset.removeNetwork;if(id===loading||id===localStorage.getItem('tuka-meta-city')){status.textContent='Choose another network before removing the active timetable.';return;}
   try{await removeImportedFeed(id);render();status.textContent='Timetable removed. Saved places remain separate in case you import it again.';}catch{status.textContent='Could not remove the timetable from this device.';}
  }
 };
 $('#network-import-form').onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;pending=null;$('#network-review').disabled=true;$('#network-review-result').textContent='Reading and validating the timetable…';
  try{pending=await reviewFeed($('#network-file').files[0],$('#network-name').value);const p=pending.profile,s=p.summary;
   $('#network-review-result').innerHTML='<article class="network-review"><span class="eyebrow">READY TO IMPORT</span><h3>'+esc(p.name)+'</h3><p>'+esc(p.label)+'</p>'+(p.agencies.length>2?'<details><summary>View all '+p.agencies.length+' agencies</summary><p>'+esc(p.agencies.join(' · '))+'</p></details>':'')+'<dl><div><dt>Stops</dt><dd>'+s.stops+'</dd></div><div><dt>Routes</dt><dd>'+s.routes+'</dd></div><div><dt>Trips</dt><dd>'+s.trips+'</dd></div><div><dt>Time zone</dt><dd>'+esc(p.timezone)+'</dd></div></dl>'+(s.feedEnd?'<p>Published service through '+esc(s.feedEnd.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'))+'.</p>':'')+'<p>Timetable only. Live arrivals, operator news and ticketing are not included in GTFS Schedule.</p>'+p.warnings.map(w=>'<p class="notice">'+esc(w)+'</p>').join('')+'<label>Save as<select id="network-import-target"><option value="">New network</option>'+providers().filter(p=>p.imported).map(p=>'<option value="'+esc(p.id)+'">Update '+esc(p.name)+' (keep saved places)</option>').join('')+'</select></label><button type="button" id="network-import-confirm" class="primary">Import &amp; open network</button></article>';$('#network-review-result').scrollIntoView({block:'nearest',behavior:'smooth'});
  }catch(error){$('#network-review-result').textContent=error.message;}finally{busy=false;$('#network-review').disabled=false;}
 };
 $('#network-review-result').onclick=async event=>{if(!event.target.closest('#network-import-confirm')||!pending||busy)return;busy=true;event.target.disabled=true;
  try{const profile=await importReviewedFeed(pending,{replaceId:$('#network-import-target').value||null});pending=null;render();status.textContent='Timetable saved. Opening '+profile.name+'…';document.dispatchEvent(new CustomEvent('tuka-test-city',{detail:{cityId:profile.id}}));$('#network-review-result').textContent='Imported successfully. You can open this network again from the list.';}
  catch(error){$('#network-review-result').textContent='Could not save this network: '+error.message+'. Your previous network is unchanged.';}finally{busy=false;}
 };
 document.addEventListener('tuka-city-loading',e=>{loading=e.detail.cityId;});
 document.addEventListener('tuka-location-ready',()=>dialog.close());document.addEventListener('tuka-choose-city',()=>button.click());
 document.addEventListener('tuka-location-unsupported',()=>{status.textContent='No installed network covers your location. Choose a network or import a GTFS ZIP.';});
 document.addEventListener('tuka-test-city-active',e=>{loading=null;const p=providerFor(e.detail.cityId);button.textContent=p.name+' ▾';button.title='Change network · '+p.name;button.setAttribute('aria-label','Change network · '+p.name);dialog.close();});
 document.addEventListener('tuka-city-error',e=>{loading=null;status.textContent=e.detail.message;if(!dialog.open)dialog.showModal();});
}
initNetworkPicker(document);
