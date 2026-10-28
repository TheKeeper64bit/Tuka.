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
  assert.deepEqual(data.cities.map(city => city.id), ['skopje', 'boston']);
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
