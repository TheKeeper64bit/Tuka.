import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/meta-site.js';

const env = {META_AUTH_USER: 'CerebralValley', META_AUTH_PASSWORD: 'meta', ASSETS: {fetch: async request => new Response('<html>meta</html>', {headers: {'Content-Type': 'text/html'}})}};
const auth = 'Basic ' + Buffer.from('CerebralValley:meta').toString('base64');

test('Meta site fails closed without valid basic auth', async () => {
  const response = await worker.fetch(new Request('https://tuka.meta-cerebralvalley.rand0m.net/'), env);
  assert.equal(response.status, 401);
  assert.match(response.headers.get('WWW-Authenticate'), /Basic/);
});

test('Meta site serves the protected shell and city registry', async () => {
  const response = await worker.fetch(new Request('https://tuka.meta-cerebralvalley.rand0m.net/api/cities', {headers: {Authorization: auth}}), env);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.cities.map(city => city.id), ['skopje', 'boston']);
  assert.equal(data.cities[0].timezone, 'Europe/Skopje');
  assert.equal(data.cities[1].timezone, 'America/New_York');
});

test('Meta assistant does not pretend to work when token is missing', async () => {
  const response = await worker.fetch(new Request('https://tuka.meta-cerebralvalley.rand0m.net/api/meta/ask', {method: 'POST', headers: {Authorization: auth, 'Content-Type': 'application/json'}, body: JSON.stringify({message: 'What is live in Skopje?'})}), env);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured/i);
});
