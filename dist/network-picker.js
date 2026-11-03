import {polishHeader} from './header.js?v=1';
import {providers,providerFor} from './city-providers.js?v=3';
import {restoreImportedFeeds} from './feed-store.js?v=1';
import {reviewFeed,importReviewedFeed,removeImportedFeed} from './feed-import.js?v=2';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const findingLabels={required_field:'Missing required fields',agency_reference:'Unresolved agency references',trip_reference:'Unresolved route or service references',excluded_trip:'Trips omitted by timetable validation',direction:'Ambiguous or invalid direction information',shape_reference:'Missing referenced shapes',stop_reference:'Unresolved stop or trip references',calendar:'Invalid service calendar records',expired_calendar:'Published service has expired',duplicate_stop:'Stops share the same name and coordinates',suspicious_shape:'Sampled shape disagrees with its stop sequence',no_shapes:'Published route shapes unavailable',unsupported:'Features outside the schedule importer'};
const checkLabels={source_export:'Compare the records with a fresh official export.',references:'Check that the referenced IDs exist in the matching GTFS tables.',stop_order:'Verify stop sequence and travel direction against the operator timetable.',shape_alignment:'Compare the shape against the published stop order and map.',headsigns:'Confirm direction IDs and destination names with the operator.',service_dates:'Verify service dates and exceptions in the official timetable.',capabilities:'Check which capabilities the operator publishes separately.'};

function attachInspector(article,record,isCurrent){
 const report=record.profile.diagnostics;
 const section=article.ownerDocument.createElement('details');section.className='network-inspector';
 section.innerHTML='<summary>AI Network Inspector · '+report.warnings+' warnings</summary><p>Local validation passed · '+report.critical+' critical errors. '+(report.afterMidnight?'Includes after-midnight service. ':'')+'Geometry checked on a bounded sample.</p><ul>'+report.findings.map(f=>'<li><strong>'+esc(f.severity==='unsupported'?'Unsupported capability':'Verified finding')+':</strong> '+esc(findingLabels[f.code])+' ('+f.count+')'+(f.ids.length?' · '+esc(f.ids.join(', ')):'')+'</li>').join('')+'</ul><p role="status">'+(report.findings.length?'Open to check AI availability.':'No anomalies need AI analysis.')+'</p><button type="button" class="secondary" hidden>Analyze network</button><div class="network-inspector-result"></div>';
 article.querySelector('#network-import-confirm').before(section);
 const status=section.querySelector('[role=status]'),action=section.querySelector('button'),results=section.querySelector('.network-inspector-result');
 section.addEventListener('toggle',async()=>{
  if(!section.open||!report.findings.length||section.dataset.checked)return;
  section.dataset.checked='true';status.textContent='Checking AI availability…';
  try{
   const response=await fetch('./api/meta/network-inspector',{signal:AbortSignal.timeout(5000)});
   if(!response.ok||!(await response.json()).available)throw Error();
   if(!isCurrent())return;
   status.textContent='Optional. Sends a small diagnostic summary and sample IDs. Your ZIP stays on this device.';
   action.hidden=false;
  }catch{status.textContent='AI inspection unavailable. You can still import the timetable.';}
 });
 action.onclick=async()=>{
  action.disabled=true;status.textContent='Analyzing findings…';
  try{
   const response=await fetch('./api/meta/network-inspector',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(23000),body:JSON.stringify({hash:record.profile.feedVersion,version:report.version,findings:report.findings})});
   const data=await response.json();if(!isCurrent())return;
   if(!response.ok)throw Error(data.error||'AI inspection unavailable.');
   status.textContent=(data.cached?'Cached analysis':'Analysis complete')+(data.provider?' · '+data.provider:'')+(data.usage?.total!=null?' · '+data.usage.total+' tokens reported':' · token usage unavailable');
   results.innerHTML='<strong>AI suggestions to verify</strong>'+(data.suggestions.length?'<ul>'+data.suggestions.map(row=>'<li>'+esc(findingLabels[row.code])+': '+esc(checkLabels[row.check])+'</li>').join('')+'</ul>':'<p>No additional checks suggested.</p>');
  }catch(error){if(isCurrent())status.textContent=error.message+' Local import remains available.';}
  finally{action.disabled=false;}
 };
}
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
   $('#network-review-result').innerHTML='<article class="network-review"><span class="eyebrow">READY TO IMPORT</span><h3>'+esc(p.name)+'</h3><p>'+esc(p.label)+'</p>'+(p.agencies.length>2?'<details><summary>View all '+p.agencies.length+' agencies</summary><p>'+esc(p.agencies.join(' · '))+'</p></details>':'')+'<dl><div><dt>Stops</dt><dd>'+s.stops+'</dd></div><div><dt>Routes</dt><dd>'+s.routes+'</dd></div><div><dt>Trips</dt><dd>'+s.trips+'</dd></div><div><dt>Time zone</dt><dd>'+esc(p.timezone)+'</dd></div></dl>'+(s.feedEnd?'<p>Published service through '+esc(s.feedEnd.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'))+'.</p>':'')+'<p>Timetable only. Live arrivals, operator news and ticketing are not included in GTFS Schedule.</p>'+p.warnings.map(w=>'<p class="notice">'+esc(w)+'</p>').join('')+'<label>Save as<select id="network-import-target"><option value="">New network</option>'+providers().filter(p=>p.imported).map(p=>'<option value="'+esc(p.id)+'">Update '+esc(p.name)+' (keep saved places)</option>').join('')+'</select></label><button type="button" id="network-import-confirm" class="primary">Import &amp; open network</button></article>';const reviewed=pending;attachInspector($('.network-review'),reviewed,()=>pending===reviewed);$('#network-review-result').scrollIntoView({block:'nearest',behavior:'smooth'});
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
