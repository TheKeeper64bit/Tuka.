import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('dist/login.html','utf8');
const source = readFileSync('dist/login.js','utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(session = {authenticated:false, pending:false}) {
  let now = 1000000, tick, redirected;
  const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id]) => [id, {
    hidden:['code-form','retry-request'].includes(id), value:'', textContent:'', disabled:false, handlers:{},
    addEventListener(name,fn){this.handlers[name]=fn;}, focus(){this.focused=true;},
  }]));
  const buttons = [{disabled:false},{disabled:false},nodes.get('resend-code')];
  const calls=[];
  let respond = () => ({ok:true, value:session});
  vm.runInNewContext(source, {
    document:{querySelector:s=>nodes.get(s.slice(1)),querySelectorAll:()=>buttons}, window:{}, navigator:{},
    location:{replace:url=>{redirected=url;}},
    Date:class extends Date {static now(){return now;}},setInterval:fn=>{tick=fn;},
    fetch:async(path,options)=>{calls.push({path,options});const r=await respond(path,options);return {ok:r.ok,json:async()=>r.value};},
  });
  return {nodes,buttons,calls,get redirected(){return redirected;},respond:fn=>{respond=fn;},
    time:value=>{now=value;tick();},
    fire:(id,event='click')=>nodes.get(id).handlers[event]({preventDefault(){},target:nodes.get(id)}),
  };
}
const pending={pending:true,reference:'ABCD1234',expiresAt:1600000,resendAt:1060000};
test('pending login survives reload with cooldown; resend clears old code and shows new reference',async()=>{
  const s=setup(pending);await flush();
  assert.equal(s.nodes.get('request-form').hidden,true);
  assert.equal(s.nodes.get('resend-code').disabled,true);
  assert.equal(s.nodes.get('resend-code').textContent,'Resend code in 60s');
  s.time(1060000);assert.equal(s.nodes.get('resend-code').disabled,false);
  s.nodes.get('code').value='12345678';
  s.respond(()=>({ok:true,value:{...pending,reference:'EFGH5678',expiresAt:1660000,resendAt:1120000}}));
  s.fire('resend-code');assert(s.buttons.every(b=>b.disabled));await flush();
  assert.equal(s.calls.at(-1).path,'/auth/resend');
  assert.equal(s.calls.at(-1).options.body,'{}');
  assert.equal(s.nodes.get('reference').textContent,'EFGH5678');
  assert.equal(s.nodes.get('code').value,'');
  assert.match(s.nodes.get('status').textContent,/previous code no longer works/);
  assert.equal(s.nodes.get('resend-code').disabled,true);
  assert.equal(s.buttons[1].disabled,false);
  s.time(1660001);assert.equal(s.nodes.get('code-form').hidden,true);assert.equal(s.nodes.get('retry-request').hidden,false);
  s.fire('retry-request');assert.equal(s.nodes.get('request-form').hidden,false);
});
test('resend failures preserve input, synchronize server cooldown, and prevent overlapping submissions',async()=>{
  const s=setup(pending);await flush();s.time(1060000);s.nodes.get('code').value='12345678';
  let resolve;
  s.respond(()=>new Promise(r=>{resolve=r;}));
  s.fire('resend-code');s.fire('code-form','submit');await flush();
  assert.equal(s.calls.filter(c=>c.path!=='/auth/session').length,1);
  resolve({ok:false,value:{error:'Wait one minute between codes.',resendAt:1090000}});await flush();
  assert.equal(s.nodes.get('code').value,'12345678');
  assert.equal(s.nodes.get('resend-code').textContent,'Resend code in 30s');
  assert.equal(s.nodes.get('status').textContent,'Wait one minute between codes.');
  s.time(1090000);s.respond(()=>({ok:false,value:{error:'Delivery failed. Your previous code still works.'}}));
  s.fire('resend-code');await flush();assert.equal(s.nodes.get('code').value,'12345678');
  assert.equal(s.nodes.get('resend-code').disabled,false);
  s.respond(()=>({ok:true,value:{authenticated:true}}));s.fire('code-form','submit');await flush();
  assert.equal(s.redirected,'/');
});
