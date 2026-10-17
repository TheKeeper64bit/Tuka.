import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker,{createPublicApi,PAGES_ORIGIN} from '../server/public-api.js';
import {apiURL,apiCredentials} from '../dist/config.js';

const base='https://tuka-public-api.ignatij-tasevski.workers.dev';
function setup(){
  const calls=[],env={AUTH_DB:{shared:true}},handler=kind=>async(request,bindings)=>{
    calls.push({kind,request,bindings});
    return Response.json({kind},{headers:{'Set-Cookie':'must-not-pass=true','Access-Control-Allow-Credentials':'true'}});
  };
  const api=createPublicApi({news:handler('news'),tickets:handler('tickets'),walk:handler('walk'),live:handler('live')});
  return {calls,env,request:(path,options={})=>api.fetch(new Request(base+path,{...options,headers:{Origin:PAGES_ORIGIN,...options.headers}}),env)};
}

test('only public read routes are available and client credentials never reach handlers',async()=>{
  const s=setup();
  for(const path of ['/api/news','/api/tickets','/api/walk?from=21.4,42&to=21.401,42','/api/network','/api/live','/api/arrivals?stop=52']){
    const response=await s.request(path,{headers:{Cookie:'private-session=secret',Authorization:'Bearer secret'}});
    assert.equal(response.status,200,path);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),PAGES_ORIGIN);
    assert.equal(response.headers.get('Vary'),'Origin');
    assert.equal(response.headers.get('Set-Cookie'),null);
    assert.equal(response.headers.get('Access-Control-Allow-Credentials'),null);
    const call=s.calls.at(-1);
    assert.equal(call.request.headers.get('Cookie'),null);
    assert.equal(call.request.headers.get('Authorization'),null);
    if(['news','walk'].includes(call.kind))assert.equal(call.bindings,s.env,'shared D1 budgets remain in use');
  }
  assert.equal(s.calls.length,6);
  for(const path of ['/','/index.html','/login','/auth/session','/auth/request','/api/proxy?url=https://example.com','/api/payment']){
    assert.equal((await s.request(path)).status,404,path);
  }
  assert.equal(s.calls.length,6,'unknown routes never invoke upstream handlers');
});

test('cross-origin access is confined to Pages and preflight permits reads without credentials',async()=>{
  const s=setup();
  const allowed=await s.request('/api/news',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'Accept'}});
  assert.equal(allowed.status,204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Methods'),'GET, HEAD, OPTIONS');
  assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'),null);
  for(const origin of ['https://evil.example','https://thekeeper64bit.github.io.evil.example','null','https://tuka.rand0m.net']){
    const response=await s.request('/api/news',{headers:{Origin:origin}});
    assert.equal(response.status,403);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
  }
  for(const headers of [
    {'Access-Control-Request-Method':'POST'},
    {'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'Authorization'},
  ])assert.equal((await s.request('/api/news',{method:'OPTIONS',headers})).status,403);
  assert.equal(s.calls.length,0);
});

test('HEAD has GET semantics without a response body; writes and arbitrary queries fail closed',async()=>{
  const s=setup();
  const head=await s.request('/api/tickets',{method:'HEAD'});
  assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(s.calls[0].request.method,'GET');
  for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal((await s.request('/api/news',{method})).status,405);
  for(const path of ['/api/news?url=https://evil.example','/api/news?refresh=1','/api/arrivals','/api/arrivals?stop=1&stop=2','/api/walk?from=21.4,42','/api/live?path=rest-auth/accounts']){
    assert.equal((await s.request(path)).status,400,path);
  }
  assert.equal(s.calls.length,1);
  assert.equal((await worker.fetch(new Request(base+'/api/arrivals?stop=https://evil.example'),{})).status,404);
  assert.equal((await worker.fetch(new Request(base+'/api/walk?from=0,0&to=1,1'),{})).status,400);
});

test('provider failures remain visible to Pages without exposing server details',async()=>{
  const api=createPublicApi({news:async()=>{throw Error('secret backend detail');}});
  const response=await api.fetch(new Request(base+'/api/news',{headers:{Origin:PAGES_ORIGIN}}),{});
  assert.equal(response.status,503);assert.equal(response.headers.get('Access-Control-Allow-Origin'),PAGES_ORIGIN);
  assert(!String(await response.text()).includes('secret backend detail'));
});

test('default client API stays same-origin and Pages configuration targets its separate public origin',async()=>{
  assert.equal(apiURL('/api/news'),'/api/news');assert.equal(apiURL('./api/live'),'/api/live');
  assert.equal(apiCredentials(),'same-origin');assert.throws(()=>apiURL('https://evil.example/api/news'));
  const source=readFileSync(new URL('../dist/config.js',import.meta.url),'utf8').replace("export const API_BASE = '';",`export const API_BASE = '${base}';`);
  const pages=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  assert.equal(pages.apiURL('./api/arrivals?stop=52'),base+'/api/arrivals?stop=52');
  assert.equal(pages.apiCredentials(),'omit');
});
