import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {translateText,language,languages} from '../dist/i18n.js';

const noTrips='JSP has not included bus trips for the selected time window in the downloaded feed. Reconnect closer to travel to check for an updated timetable.';
const scope='Search covers the next 4 hours, up to two transfers and stops within 800 m of each endpoint. Try a different time or nearby point.';
const offlineMissing='No downloaded schedule is available yet. Open Tuka online and let the timetable finish loading first.';
const offlineWarning='No bus trips are published for the selected time window in the downloaded timetable. Reconnect closer to travel to get an updated feed. Walking options may still be available.';

test('complete planner and offline warnings translate without leaving English fragments',()=>{
  const app=fs.readFileSync('dist/app.js','utf8'),offline=fs.readFileSync('dist/offline.js','utf8');
  assert(app.includes(noTrips));assert(offline.includes(offlineMissing));assert(offline.includes(offlineWarning));
  const inputs=[noTrips+' '+scope,offlineMissing,offlineWarning,
    'No bus trips published for the selected time window in the downloaded feed. Walking options only. Future timetable prediction · 2026-10-18 · fastest first. Using a downloaded schedule. Walking routes are approximate; connections are not guaranteed.',
    'Choose a valid future date and time in Skopje. Times skipped when the clocks change are unavailable.',
    'No journey found in the downloaded timetable within four hours. It may be out of date.',
    'Downloaded timetable · 2026-10-17. Times are in Skopje. Some dates may have no published trips; reconnect to refresh.',
    'Connections and normal service are unconfirmed offline.',
    'No journey found in the next 4 hours. Check the service date and timetable.',
    'Timetable journey available. Live coverage is incomplete; normal service is unconfirmed.',
    'Could not calculate this journey. Try again.',
  ];
  for(const locale of ['mk','sq'])for(const input of inputs){
    const result=translateText(input,locale);
    assert.notEqual(result,input);
    assert(!/\b(No |not |bus trips|the selected|downloaded|Reconnect|Search covers|next 4 hours|Try a |Choose a |Using a |Walking options|Times are|Some dates|may be|future date|could not|Could not|Connections and|unconfirmed offline)\b/.test(result),result);
    assert.equal(translateText(input,'en'),input);
  }
});

test('deadline and connection templates preserve their actual values in both languages',()=>{
  for(const locale of ['mk','sq']){
    const deadline=translateText('Arrive by 00:05 · 18 Oct · 3.5 min late',locale);
    assert(deadline.includes('00:05 · 18 Oct'));assert(deadline.includes('3.5'));assert(!deadline.includes('late'));assert(!deadline.includes('Arrive by'));
    const estimated=translateText('Estimated arrival ~00:08 · 18 Oct. Find another journey.',locale);
    assert(estimated.includes('~00:08 · 18 Oct.'));assert(!estimated.includes('Estimated arrival'));assert(!estimated.includes('Find another journey'));
    const margin=translateText('Tight connection · 1.5 min spare after walking and your transfer buffer.',locale);
    assert(margin.includes('1.5'));assert(!/Tight connection|spare|after walking/.test(margin));
    assert(!translateText('Arrive by 08:10 · 2 min spare',locale).includes('spare'));
    assert.notEqual(translateText('Arrival deadline missed',locale),'Arrival deadline missed');
    assert.notEqual(translateText('This place could not be saved. Choose a valid location.',locale),'This place could not be saved. Choose a valid location.');
    assert.notEqual(translateText('Could not create a link for these places.',locale),'Could not create a link for these places.');
  }
});

test('composite labels translate without changing dynamic names or identifiers',()=>{
  assert.equal(translateText('YOUR JOURNEY · STEP 1 OF 3','mk'),'Вашето патување · Чекор 1 од 3');
  assert.equal(translateText('Typical · 4.5 km/h','sq'),'Zakonisht · 4.5 km/h');
  assert.equal(translateText('3 minutes','mk'),'3 минути');
  assert.equal(translateText('Stops','mk'),'Постојки');assert.equal(translateText('stops','mk'),'постојки');
  assert.equal(translateText('Arrive ~14:05','mk'),'Пристигнување ~14:05');
  assert.equal(translateText('Bus 24 · Square Hotel','mk'),'Автобус 24 · Square Hotel');
  assert.equal(translateText('Bus 15A · Square Hotel','mk'),'Автобус 15A · Square Hotel');
  assert.equal(translateText('Bus stop · Bus stop 1','mk'),'Автобуска постојка · Автобуска постојка 1');
  assert.equal(translateText('Bus stop · Dimitrie Čupovski · Skopje','mk'),'Автобуска постојка · Dimitrie Čupovski · Skopje');
  assert.equal(translateText('Bus stop · Bus stop 1','sq'),'Stacion autobusi · Stacion autobusi 1');
  assert.equal(translateText('Bus stop · Dimitrie Čupovski · Skopje','sq'),'Stacion autobusi · Dimitrie Čupovski · Skopje');
  assert.equal(translateText('Walk to Work Hotel','sq'),'Ec drejt Work Hotel');
  assert.equal(translateText('Walk ~300 m (4 min) + 2 min minimum transfer time','mk'),'Пешачи ~300 m (4 мин) + 2 мин Минимално време за преседнување');
  assert.equal(translateText('View full timetable (142 departures)','sq'),'Shfaq orarin e plotë (142 nisje)');
  assert.equal(translateText('Saved on this device · timetable downloaded 2026-10-17. ','mk'),'Зачувано на овој уред · возниот ред е преземен 2026-10-17. ');
  assert.equal(translateText('1 transfers · ~420 m walking · Tight connection','sq'),'1 Ndërrime · ~420 m ecje · Ndërrim me pak kohë');
  for(const name of ['Broadway Work Hotel','Macedonia Square Hotel','End of Journey Hotel','РЕКОРД · 5','ул. Македонија 24'])for(const locale of ['mk','sq'])assert.equal(translateText(name,locale),name);
});

// A small DOM harness runs the real observer integration. The assertions exercise
// a language switch, content replaced by app updates and protected source text.
function domHarness(initialLanguage='mk'){
  const textNodes=[],allElements=[],frames=[],store=new Map(initialLanguage?[['tuka-language',initialLanguage]]:[]),events=new Map();let observer;
  class Element{
    constructor(matches=[]){this.selectors=new Set(matches);this.attrs=new Map();this.handlers=new Map();this.dataset={};this.children=[];allElements.push(this);}
    matches(selector){return selector.split(',').some(value=>this.selectors.has(value)||value==='[data-no-translate]'&&this.attrs.has('data-no-translate')||value==='[data-language]'&&this.dataset.language);}
    closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
    setAttribute(key,value){this.attrs.set(key,value);}
    hasAttribute(key){return this.attrs.has(key);}
    getAttribute(key){return this.attrs.get(key);}
    append(child){child.parentElement=this;this.children.push(child);}
    addEventListener(name,fn){this.handlers.set(name,fn);}
    querySelector(){return this.closeButton??=new Element(['.language-close']);}
    showModal(){this.open=true;}
    close(){this.open=false;}
  }
  const body=new Element(),document={body,documentElement:{},createElement(){return new Element();},createTreeWalker(){let i=0;return {nextNode:()=>textNodes[i++]};},querySelectorAll(){return allElements.filter(e=>['aria-label','placeholder','title'].some(k=>e.hasAttribute(k)));},addEventListener(name,fn){events.set(name,fn);},dispatchEvent(e){events.get(e.type)?.(e);}};
  function node(text,selectors=[]){const parent=new Element(selectors);body.append(parent);const n={textContent:text,parentElement:parent};textNodes.push(n);return n;}
  const warning=node(offlineMissing),place=node('Hotel',['.place > strong']),notice=node('No journey found in the next 4 hours. Check the service date and timetable.',['[data-no-translate]']);
  const input=new Element();input.setAttribute('placeholder','Search origin');body.append(input);
  const shortcut=new Element(['[data-place-shortcut]']);shortcut.setAttribute('title','Work');body.append(shortcut);
  class Observer{constructor(fn){this.fn=fn;observer=this;}disconnect(){}observe(){}}
  const localStorage={getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)};
  const source=fs.readFileSync('dist/language.js','utf8').replace(/^import[^\n]+\n/,'');
  vm.runInNewContext(source,{language:()=>language(localStorage),languages,translateText,document,localStorage,NodeFilter:{SHOW_TEXT:4},MutationObserver:Observer,requestAnimationFrame:fn=>frames.push(fn),CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}}});
  const dialog=body.children.at(-1);
  function choose(locale){const button=new Element();button.dataset.language=locale;dialog.handlers.get('click')({target:button});}
  function refresh(){observer.fn();while(frames.length)frames.shift()();}
  return {choose,refresh,node,warning,place,notice,input,shortcut,dialog,document,store};
}

test('DOM translations are reversible, update dynamically and protect names and source notices',()=>{
  const ui=domHarness();
  assert.equal(ui.warning.textContent,translateText(offlineMissing,'mk'));assert.equal(ui.input.getAttribute('placeholder'),'Пребарај почетна точка');
  assert.equal(ui.place.textContent,'Hotel');assert(ui.notice.textContent.startsWith('No journey'));assert.equal(ui.shortcut.getAttribute('title'),'Work');
  ui.choose('sq');assert.equal(ui.warning.textContent,translateText(offlineMissing,'sq'));assert.equal(ui.document.documentElement.lang,'sq');
  ui.warning.textContent=offlineWarning;ui.input.setAttribute('placeholder','Search destination');ui.refresh();
  assert.equal(ui.warning.textContent,translateText(offlineWarning,'sq'));assert.equal(ui.input.getAttribute('placeholder'),'Kërko destinacionin');
  const commute=ui.node('No journey found in the next 4 hours. Check the service date and timetable. Checked 14:05',['.commute-card > p','.commute-status']);
  const namedStop=ui.node('Home',['.stopcard h3']);
  const commuteNames=ui.node('Home → Work',['.commute-card > p:not(.commute-status)']);
  const added=ui.node('Arrive by 08:10 · 2 min late');ui.refresh();assert.equal(added.textContent,'Mbërri deri në 08:10 · 2 min vonesë');
  assert(!commute.textContent.includes('No journey'));assert(commute.textContent.endsWith('Kontrolluar 14:05'));
  assert.equal(namedStop.textContent,'Home');assert.equal(commuteNames.textContent,'Home → Work');
  ui.choose('en');assert.equal(ui.warning.textContent,offlineWarning);assert.equal(ui.input.getAttribute('placeholder'),'Search destination');assert.equal(added.textContent,'Arrive by 08:10 · 2 min late');
  ui.choose('mk');assert.equal(ui.warning.textContent,translateText(offlineWarning,'mk'));assert.equal(ui.store.get('tuka-language'),'mk');
});

test('first launch requires a language choice and stores the selected language',()=>{
  const ui=domHarness(null);assert.equal(ui.dialog.open,true);let prevented=false;
  ui.dialog.handlers.get('cancel')({preventDefault(){prevented=true;}});assert(prevented);
  ui.choose('sq');assert.equal(ui.dialog.open,false);assert.equal(ui.store.get('tuka-language'),'sq');
});
