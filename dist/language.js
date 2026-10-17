import {language,languages,translateText} from './i18n.js?v=26';
let locale=language(),scheduled=false;
const originals=new WeakMap(),attributes=new WeakMap();
const sourceContent='script,style,[data-no-translate],.news-summary,.news-body p,.news-story h2,.maplibregl-ctrl-attrib';
// These nodes contain names supplied by the map/timetable or by the passenger.
// Match the immediate parent so nested UI labels such as Exact match still translate.
const placeNames='.place > strong,.destination,.saved-arrival-destination,.stop-title h2,.commute-card > p:not(.commute-status),.stopcard h3,.target-panel > strong,.ride-stops strong,.stoplist button,#offline-journeys h3,#offline-journeys article > p,#offline-stops h3';
const ignored=node=>node.parentElement?.closest(sourceContent)||node.parentElement?.matches(placeNames);
function apply(){
 observer.disconnect();document.documentElement.lang=locale;
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 for(let node;node=walker.nextNode();){if(ignored(node)||!node.textContent.trim())continue;let record=originals.get(node);if(!record||node.textContent!==record.output)record={input:node.textContent};record.output=translateText(record.input,locale);originals.set(node,record);if(node.textContent!==record.output)node.textContent=record.output;}
 for(const element of document.querySelectorAll('[aria-label],[placeholder],[title]')){if(element.closest(sourceContent))continue;let records=attributes.get(element)||{};for(const key of ['aria-label','placeholder','title']){if(!element.hasAttribute(key)||(key==='title'&&element.matches('[data-place-shortcut]')))continue;const value=element.getAttribute(key);let r=records[key];if(!r||value!==r.output)r={input:value};r.output=translateText(r.input,locale);records[key]=r;if(value!==r.output)element.setAttribute(key,r.output);}attributes.set(element,records);}
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','placeholder','title']});
}
const observer=new MutationObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply();});}});
const dialog=document.createElement('dialog');dialog.className='language-dialog';dialog.setAttribute('aria-labelledby','language-title');dialog.setAttribute('data-no-translate','');
dialog.innerHTML='<span class="language-brand">tuka<span>.</span></span><h2 id="language-title">Choose your language</h2><p>Изберете јазик · Zgjidhni gjuhën</p><div class="language-choices">'+Object.entries(languages).map(([code,label])=>`<button data-language="${code}"><strong>${label}</strong><span>${{mk:'MK',sq:'SQ',en:'EN'}[code]}</span></button>`).join('')+'</div><button class="language-close" aria-label="Close">×</button>';
document.body.append(dialog);
let chosen;try{chosen=languages[localStorage.getItem('tuka-language')];}catch{}
function open(){dialog.querySelector('.language-close').hidden=!chosen;dialog.showModal();}
dialog.addEventListener('cancel',e=>{if(!chosen)e.preventDefault();});
dialog.addEventListener('click',e=>{const b=e.target.closest('[data-language]');if(b){locale=b.dataset.language;chosen=true;try{localStorage.setItem('tuka-language',locale);}catch{}apply();dialog.close();document.dispatchEvent(new CustomEvent('tuka-language',{detail:locale}));}else if(e.target.closest('.language-close'))dialog.close();});
document.addEventListener('click',e=>{if(e.target.closest('[data-language-open]'))open();});
apply();if(!chosen)open();
