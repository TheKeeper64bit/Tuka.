import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/cloudflare.js';

const origin='https://tuka.rand0m.net';
function setup(){
  const assets=[],env={PUBLIC_ORIGIN:origin,ASSETS:{fetch:async request=>{assets.push(new URL(request.url));return new Response('public Tuka asset');}}};
  const request=(path,method='GET',headers={})=>worker.fetch(new Request(origin+path,{method,headers}),env);
  return {env,request,assets};
}

test('visitors open the app and assets without cookies, secrets or access services',async()=>{
  const s=setup();
  for(const path of ['/','/index.html','/app.js?v=25','/language.js?v=26','/offline.html','/?stop=1513','/?from=42,21.4&to=42.01,21.42']){
    const response=await s.request(path);
    assert.equal(response.status,200,path);assert.equal(response.headers.get('Location'),null);
    assert.equal(response.headers.get('Set-Cookie'),null);assert.equal(await response.text(),'public Tuka asset');
  }
  assert.equal(s.assets[0].pathname,'/index.html');
  assert.equal(s.assets.at(-1).search,'?from=42,21.4&to=42.01,21.42');
  assert.equal((await s.request('/','GET',{Cookie:'__Host-tuka_session=expired'})).status,200);
});

test('old login links return directly to Tuka and preserve safe shared links',async()=>{
  const s=setup(),shared='/?from=42,21.4&to=42.01,21.42&fromName=Home';
  for(const path of ['/login','/login.html'])assert.equal((await s.request(path)).headers.get('Location'),'/');
  const response=await s.request('/login?next='+encodeURIComponent(shared));
  assert.equal(response.status,303);assert.equal(response.headers.get('Location'),shared);
  for(const target of ['https://example.com','//example.com','/\\example.com','/login','/?stop=1\nBad: header'])assert.equal((await s.request('/login?next='+encodeURIComponent(target))).headers.get('Location'),'/');
});

test('older clients see public access and retired code endpoints never use email or D1',async()=>{
  const s=setup(),unavailable=new Proxy({}, {get(){throw Error('Access service must not be used');}});
  s.env.AUTH_DB=unavailable;s.env.OWNER_EMAIL=unavailable;
  assert.deepEqual(await (await s.request('/auth/session')).json(),{authenticated:true,public:true});
  for(const endpoint of ['request','resend','verify','logout']){
    const response=await s.request('/auth/'+endpoint,'POST');assert.equal(response.status,410);
    assert.equal(response.headers.get('Set-Cookie'),null);assert.equal((await response.json()).redirect,'/');
  }
});

test('public API routes reach validation and cached news without login',async()=>{
  const s=setup();
  s.env.AUTH_DB={prepare:()=>({first:async()=>({payload:JSON.stringify({articles:[],checkedAt:new Date().toISOString()}),checked_at:Date.now(),retry_after:Date.now()+60000})})};
  assert.equal((await s.request('/api/news')).status,200);
  assert.equal((await s.request('/api/walk?from=invalid&to=invalid')).status,400);
  for(const path of ['/api/news','/api/walk','/api/tickets','/api/live'])assert.equal((await s.request(path,'POST')).status,405,path);
  assert.equal((await s.request('/api/unknown')).status,404);
});

test('public responses retain HTTPS and security headers; HEAD has no body',async()=>{
  const s=setup(),redirect=await worker.fetch(new Request('http://tuka.rand0m.net/?stop=1'),s.env);
  assert.equal(redirect.status,308);assert.equal(redirect.headers.get('Location'),origin+'/?stop=1');
  for(const path of ['/','/login','/auth/session']){
    const response=await s.request(path,'HEAD');assert.equal(await response.text(),'');
    assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
    assert.equal(response.headers.get('Strict-Transport-Security'),'max-age=31536000');
  }
});
