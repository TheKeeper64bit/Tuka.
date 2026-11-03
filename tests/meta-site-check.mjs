import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/meta-site.js';

const env = {META_AUTH_USER: 'CerebralValley', META_AUTH_PASSWORD: 'meta', ASSETS: {fetch: async request => new Response(new URL(request.url).pathname === '/meta-login' ? '<form><input name="username"></form>' : '<html>meta</html>', {headers: {'Content-Type': 'text/html'}})}};

test('Meta site serves a real login page instead of a browser prompt', async () => {
  const response = await worker.fetch(new Request('https://tuka.meta-cerebralvalley.rand0m.net/'), env);
  assert.equal(response.status, 303);
  assert.match(response.headers.get('Location'), /\/login/);
  const login = await worker.fetch(new Request('https://tuka.meta-cerebralvalley.rand0m.net/login?next=%2F'), env);
  assert.equal(login.status, 200);
  assert.match(await login.text(), /name="username"/);
});

test('valid form login creates an HttpOnly session and exposes city registry', async () => {
  const form = new URLSearchParams({username: 'CerebralValley', password: 'meta', next: '/'});
  const loggedIn = await worker.fetch(new Request('https://tuka.meta-cerebralvalley.rand0m.net/auth/login', {method: 'POST', body: form}), env);
  assert.equal(loggedIn.status, 303);
  const cookie = loggedIn.headers.get('Set-Cookie');
  assert.match(cookie, /HttpOnly/);
  const response = await worker.fetch(new Request('https://tuka.meta-cerebralvalley.rand0m.net/api/cities', {headers: {Cookie: cookie.split(';')[0]}}), env);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.cities.map(city => city.id), ['skopje', 'boston', 'tilburg']);
  assert.equal(data.cities[0].timezone, 'Europe/Skopje');
  assert.equal(data.cities[1].timezone, 'America/New_York');
});

test('wrong form credentials do not create a session', async () => {
  const form = new URLSearchParams({username: 'CerebralValley', password: 'wrong'});
  const response = await worker.fetch(new Request('https://tuka.meta-cerebralvalley.rand0m.net/auth/login', {method: 'POST', body: form}), env);
  assert.equal(response.status, 303);
  assert.match(response.headers.get('Location'), /error=invalid/);
});

test('Meta assistant does not pretend to work when token is missing', async () => {
  const form = new URLSearchParams({username: 'CerebralValley', password: 'meta'});
  const login = await worker.fetch(new Request('https://tuka.meta-cerebralvalley.rand0m.net/auth/login', {method: 'POST', body: form}), env);
  const cookie = login.headers.get('Set-Cookie').split(';')[0];
  const response = await worker.fetch(new Request('https://tuka.meta-cerebralvalley.rand0m.net/api/meta/ask', {method: 'POST', headers: {Cookie: cookie, 'Content-Type': 'application/json'}, body: JSON.stringify({message: 'What is live in Skopje?'})}), env);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured/i);
});

test('Boston realtime endpoint normalizes official MBTA predictions and vehicles', async () => {
  const form = new URLSearchParams({username: 'CerebralValley', password: 'meta'});
  const login = await worker.fetch(new Request('https://tuka.meta-cerebralvalley.rand0m.net/auth/login', {method: 'POST', body: form}), env);
  const cookie = login.headers.get('Set-Cookie').split(';')[0];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async request => {
    const url = String(request.url || request);
    if (url.includes('/predictions')) return new Response(JSON.stringify({data: [{id: 'p1', attributes: {departure_time: '2026-10-28T18:30:00-04:00', status: 'On time'}, relationships: {route: {data: {id: '1'}}, trip: {data: {id: 'trip-1'}}, stop: {data: {id: '123'}}}}]}), {headers: {'Content-Type': 'application/json'}});
    return new Response(JSON.stringify({data: [{id: 'v1', attributes: {label: '1234', latitude: 42.35, longitude: -71.06, current_status: 'IN_TRANSIT_TO'}, relationships: {route: {data: {id: '1'}}, trip: {data: {id: 'trip-1'}}}}]}), {headers: {'Content-Type': 'application/json'}});
  };
  try {
    const response = await worker.fetch(new Request('https://tuka.meta-cerebralvalley.rand0m.net/api/boston/realtime?stop=123', {headers: {Cookie: cookie}}), {...env, MBTA_API_BASE: 'https://api-v3.mbta.com'});
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.liveAvailable, true);
    assert.equal(data.predictions[0].route, '1');
    assert.equal(data.vehicles[0].lat, 42.35);
  } finally { globalThis.fetch = originalFetch; }
});

test('Boston route-shapes endpoint validates and returns route geometry', async () => {
  const form = new URLSearchParams({username: 'CerebralValley', password: 'meta'});
  const login = await worker.fetch(new Request('https://tuka.meta-cerebralvalley.rand0m.net/auth/login', {method: 'POST', body: form}), env);
  const cookie = login.headers.get('Set-Cookie').split(';')[0];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async request => {
    const url = String(request.url || request);
    assert.match(url, /\/shapes\?/);
    return new Response(JSON.stringify({data: [{id: 'shape-1', attributes: {polyline: 'onnaG~u}pLo}@o}@o}@o}@'}}]}), {headers: {'Content-Type': 'application/json'}});
  };
  try {
    const response = await worker.fetch(new Request('https://tuka.meta-cerebralvalley.rand0m.net/api/boston/route-shapes?routes=1', {headers: {Cookie: cookie}}), {...env, MBTA_API_BASE: 'https://api-v3.mbta.com'});
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.features.length, 1);
    assert.equal(data.features[0].properties.route, '1');
  } finally { globalThis.fetch = originalFetch; }
});

test('Tilburg feeds, notices and Meta interpretation require the existing login',async()=>{
 for(const path of ['/api/transit/tilburg/trips','/api/transit/tilburg/vehicles','/api/transit/tilburg/alerts','/api/news?city=tilburg','/api/meta/interpret']){
  const response=await worker.fetch(new Request('https://tuka.meta-cerebralvalley.rand0m.net'+path),env);
  assert.equal(response.status,401);
 }
});


async function copilotRequest(config){
 const form=new URLSearchParams({username:'CerebralValley',password:'meta'}),login=await worker.fetch(new Request('https://tuka.test/auth/login',{method:'POST',body:form}),config);
 return worker.fetch(new Request('https://tuka.test/api/meta/ask',{method:'POST',headers:{Cookie:login.headers.get('Set-Cookie').split(';')[0],'Content-Type':'application/json'},body:JSON.stringify({cityId:'skopje',message:'What network can I use?'})}),config);
}
test('Copilot supports Baseten-only credentials without exposing the key',async t=>{
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'https://inference.baseten.co/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer secret-baseten');const body=JSON.parse(options.body);assert.equal(body.model,'tool-model');assert.equal(body.max_tokens,760);assert.equal(body.max_completion_tokens,undefined);return Response.json({choices:[{message:{content:'Check departures in the planner.'}}]});});
 const r=await copilotRequest({...env,BASETEN_API_KEY:'secret-baseten',BASETEN_MODEL:'tool-model'});assert.equal(r.status,200);const body=await r.json();assert.equal(body.provider,'baseten');assert.equal(body.model,'tool-model');assert(!JSON.stringify(body).includes('secret-baseten'));
});
test('Copilot fallback replays verified tool context with the provider that succeeded',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,headers:options.headers,body:JSON.parse(options.body)});if(calls.length===1)return new Response('',{status:503});if(calls.length===2)return Response.json({choices:[{message:{tool_calls:[{id:'context-1',type:'function',function:{name:'get_city_context',arguments:JSON.stringify({city_id:'skopje'})}}]}}]});return Response.json({choices:[{message:{content:'Use the planner for verified departures.'}}]});});
 const r=await copilotRequest({...env,MODEL_API_KEY:'secret-meta',BASETEN_API_KEY:'secret-baseten',BASETEN_MODEL:'tool-model'});assert.equal(r.status,200);assert.equal((await r.json()).provider,'baseten');assert.equal(calls.length,3);assert.match(calls[0].url,/api.meta.ai/);assert(calls.slice(1).every(c=>c.url==='https://inference.baseten.co/v1/chat/completions'));assert(calls[2].body.messages.some(m=>m.role==='tool'&&m.tool_call_id==='context-1'));assert.equal(calls[0].headers.Authorization,'Bearer secret-meta');assert.equal(calls[2].headers.Authorization,'Bearer secret-baseten');
});

test('Copilot chat and tool follow-up use the configured Baseten hackathon model', async () => {
  const config = {...env, BASETEN_API_KEY:'test-baseten', BASETEN_MODEL:'meta-models/muse-spark-open-1026', MODEL_PROVIDER:'baseten'};
  const login = await worker.fetch(new Request('https://tuka.test/auth/login', {method:'POST',body:new URLSearchParams({username:'CerebralValley',password:'meta'})}),config);
  const cookie=login.headers.get('Set-Cookie').split(';')[0];
  const originalFetch=globalThis.fetch;let count=0;
  globalThis.fetch=async (url,options)=>{
    count++;assert.equal(url,'https://inference.baseten.co/v1/chat/completions');
    assert.equal(options.headers.Authorization,'Bearer test-baseten');assert.equal(options.redirect,'manual');
    const body=JSON.parse(options.body);assert.equal(body.model,config.BASETEN_MODEL);
    if(count===1)return Response.json({choices:[{message:{tool_calls:[{id:'call-1',type:'function',function:{name:'get_network_profiles',arguments:'{}'}}]}}]});
    assert.ok(body.messages.some(m=>m.role==='tool'));
    return Response.json({model:config.BASETEN_MODEL,choices:[{message:{content:'Use the journey planner for verified departures.'}}]});
  };
  try{
    const r=await worker.fetch(new Request('https://tuka.test/api/meta/ask',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({message:'What networks are available?',cityId:'tilburg'})}),config);
    assert.equal(r.status,200);assert.match((await r.json()).answer,/journey planner/);assert.equal(count,2);
  }finally{globalThis.fetch=originalFetch;}
});
