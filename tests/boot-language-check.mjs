import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {translateText} from '../dist/i18n.js';

const source=fs.readFileSync('dist/boot.js','utf8');
const initial='Finding your location and loading nearby stops…';
const slow='This is taking longer than usual. You can open the map while loading continues.';
const failure='Bus schedules could not load. Check your connection and try again.';
function harness(saved='en',{storageBlocked=false}={}){
  let now=0,reloads=0;
  const nodes=new Map(['boot-screen','boot-title','boot-status','boot-continue','boot-retry'].map(id=>[id,{textContent:'',hidden:['boot-continue','boot-retry'].includes(id),style:{visibility:'hidden'}}]));
  const listeners=new Map(),timers=[];
  const document={querySelector:selector=>nodes.get(selector.slice(1)),addEventListener:(name,listener)=>listeners.set(name,listener)};
  const window={};
  vm.runInNewContext(source,{window,document,localStorage:{getItem(){if(storageBlocked)throw Error('Blocked');return saved;}},Date:{now:()=>now},setTimeout:(callback,delay)=>timers.push({callback,delay}),location:{reload(){reloads++;}}});
  return {nodes,boot:window.tukaBoot,get reloads(){return reloads;},change(locale){listeners.get('tuka-language')({detail:locale});},advance(time){now=time;for(const timer of timers.filter(t=>!t.called&&t.delay<=time)){timer.called=true;timer.callback();}}};
}

test('saved MK and SQ paint before the loader copy is revealed, with no app-module dependency',()=>{
  const html=fs.readFileSync('dist/index.html','utf8');
  assert.match(html,/<div id="boot-screen"[^>]*data-no-translate/);
  assert.match(html,/<h1 id="boot-title"[^>]*visibility:hidden/);
  assert.match(html,/<p id="boot-status"[^>]*visibility:hidden/);
  const scripts=[...html.matchAll(/<script\b[^>]*src="boot\.js[^>]*>/g)];
  assert.equal(scripts.length,1);assert(!/\b(?:defer|async|type="module")\b/.test(scripts[0][0]));
  assert(scripts[0].index<html.indexOf('<header>'));
  assert.equal([...html.matchAll(/>SKOPJE, IN MOTION</g)].length,2);
  for(const locale of ['mk','sq']){
    const ui=harness(locale);
    assert.equal(ui.nodes.get('boot-title').textContent,translateText('Your next bus, almost here.',locale));
    assert.equal(ui.nodes.get('boot-status').textContent,translateText(initial,locale));
    assert.notEqual(ui.nodes.get('boot-title').textContent,'Your next bus, almost here.');
    assert.equal(ui.nodes.get('boot-title').style.visibility,'');assert.equal(ui.nodes.get('boot-status').style.visibility,'');
    assert.equal(ui.nodes.get('boot-screen').lang,locale);
    assert.equal(ui.nodes.get('boot-continue').textContent,translateText('Continue to map',locale));
    assert.equal(ui.nodes.get('boot-retry').textContent,translateText('Try again',locale));
  }
});

test('readiness statuses and language switching preserve the ten-second loader minimum',()=>{
  const ui=harness('mk');
  ui.boot.ready('schedule');assert.equal(ui.nodes.get('boot-status').textContent,translateText('Finding your location…','mk'));
  ui.change('sq');assert.equal(ui.nodes.get('boot-status').textContent,translateText('Finding your location…','sq'));
  ui.boot.ready('location');assert.equal(ui.nodes.get('boot-status').textContent,translateText('Getting your map ready…','sq'));
  ui.boot.ready('map');ui.advance(9999);assert.equal(ui.nodes.get('boot-screen').hidden,false);
  ui.advance(10000);assert.equal(ui.nodes.get('boot-screen').hidden,true);
  const other=harness('sq');other.boot.ready('location');assert.equal(other.nodes.get('boot-status').textContent,translateText('Loading bus stops and routes…','sq'));
});

test('slow-loading and failure messages, retry and continue remain localized and functional',()=>{
  const ui=harness('mk');ui.advance(25000);
  assert.equal(ui.nodes.get('boot-status').textContent,translateText(slow,'mk'));
  assert.equal(ui.nodes.get('boot-continue').hidden,false);assert.equal(ui.nodes.get('boot-retry').hidden,false);
  ui.change('sq');assert.equal(ui.nodes.get('boot-status').textContent,translateText(slow,'sq'));
  ui.boot.fail(failure);assert.equal(ui.nodes.get('boot-status').textContent,translateText(failure,'sq'));
  ui.boot.ready('map');assert.equal(ui.nodes.get('boot-status').textContent,translateText(failure,'sq'));
  ui.change('en');assert.equal(ui.nodes.get('boot-status').textContent,failure);
  ui.nodes.get('boot-retry').onclick();assert.equal(ui.reloads,1);
  ui.nodes.get('boot-continue').onclick();assert.equal(ui.nodes.get('boot-screen').hidden,true);
  const failed=harness('mk');failed.boot.fail(failure);failed.advance(25000);assert.equal(failed.nodes.get('boot-status').textContent,translateText(failure,'mk'));
});

test('first launch, unsupported languages and blocked storage safely retain English',()=>{
  for(const options of [{saved:null},{saved:'de'},{saved:'mk',storageBlocked:true}]){
    const ui=harness(options.saved,options);assert.equal(ui.nodes.get('boot-status').textContent,initial);
    ui.change('unsupported');assert.equal(ui.nodes.get('boot-status').textContent,initial);
    ui.change('mk');assert.equal(ui.nodes.get('boot-status').textContent,translateText(initial,'mk'));
  }
});
