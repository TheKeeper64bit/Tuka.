import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTicketGroups, ticketsResponse, TICKET_CATALOGUE_URL} from '../server/tickets.js';

const now = Date.parse('2026-10-17T10:00:00Z');
const product = {id:325, fareRuleId:37, name:'Билет за 10 возења градски линии', translations:{name:{mk:'Билет за 10 возења градски линии', en:'10 Rides City Lines'}}, status:1, price:250, activePeriod:{price:250}, currency:'MKD', charges:10, isDynamicFare:false};
const catalogue = [{name:'Градска', translations:{name:{mk:'Градска', en:'City'}}, ticketDefinitions:[product]}];
const request = () => new Request('https://tuka.rand0m.net/api/tickets');
function cacheStore() {
  const entries = new Map();
  return {
    entries,
    async match(key) { return entries.get(key.url)?.clone(); },
    async put(key, response) { assert.equal(key.headers.get('Cookie'), null); entries.set(key.url, response.clone()); },
  };
}
const validFetch = async () => Response.json(catalogue);

test('normalizes real catalogue fields and leaves opaque validity rules out of displayed fares', () => {
  const [group] = normalizeTicketGroups(catalogue);
  assert.deepEqual(group, {id:'37', name:{en:'City', mk:'Градска'}, tickets:[{id:'325', name:{en:'10 Rides City Lines', mk:product.name}, price:250, currency:'MKD', rides:10}]});
  const missingTranslation = normalizeTicketGroups([{name:'Сите', ticketDefinitions:[{...product, translations:{}, charges:undefined, activePeriod:{price:300}}]}]);
  assert.equal(missingTranslation[0].tickets[0].name.en, product.name);
  assert.equal(missingTranslation[0].tickets[0].price, 300);
  assert.equal(missingTranslation[0].tickets[0].rides, null);
});

test('rejects malformed catalogues and excludes inactive, duplicate, dynamic and invalid-price products', () => {
  for (const data of [null, {}, [], [{name:'City', ticketDefinitions:[]}], Array(51).fill(catalogue[0])]) assert.throws(() => normalizeTicketGroups(data));
  const invalid = [product, {...product}, {...product, id:2, status:0}, {...product, id:3, isDynamicFare:true}, {...product, id:4, price:-1, activePeriod:null}, {...product, id:5, currency:'<MKD>'}, {...product, id:6, price:NaN, activePeriod:null}];
  assert.equal(normalizeTicketGroups([{...catalogue[0], ticketDefinitions:invalid}])[0].tickets.length, 1);
});

test('fresh cache is shared across query strings and never forwards credentials or arbitrary URLs', async () => {
  const cache = cacheStore(); let calls = 0;
  const fetcher = async (url, options) => {
    calls++; assert.equal(url, TICKET_CATALOGUE_URL); assert.deepEqual(options.headers, {Accept:'application/json'}); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'manual'); assert(options.signal instanceof AbortSignal);
    return validFetch();
  };
  const req = new Request(request().url + '?url=https://evil.example&refresh=1', {headers:{Cookie:'secret-session', Authorization:'private'}});
  const first = await ticketsResponse(req, {cache, fetcher, now});
  assert.equal(first.status, 200); assert.equal(first.headers.get('Cache-Control'), 'no-store');
  const initial = await first.json(); assert.equal(initial.checkedAt, new Date(now).toISOString()); assert.equal(initial.stale, false);
  await ticketsResponse(request(), {cache, fetcher, now:now + 29 * 60000}); assert.equal(calls, 1);
  await ticketsResponse(request(), {cache, fetcher, now:now + 30 * 60000}); assert.equal(calls, 2);
});

test('upstream outage keeps dated fares, limits retries, and never serves fares older than one day', async () => {
  const cache = cacheStore(); let calls = 0;
  await ticketsResponse(request(), {cache, fetcher:validFetch, now});
  const fetcher = async () => { calls++; throw Error('unavailable'); };
  const first = await (await ticketsResponse(request(), {cache, fetcher, now:now + 31 * 60000})).json();
  assert.equal(first.stale, true); assert.equal(first.checkedAt, new Date(now).toISOString()); assert.equal(first.groups.length, 1);
  await ticketsResponse(request(), {cache, fetcher, now:now + 32 * 60000}); assert.equal(calls, 1);
  const expired = await ticketsResponse(request(), {cache, fetcher, now:now + 24 * 60 * 60000});
  assert.equal(expired.status, 503); assert.equal((await expired.json()).groups.length, 0);
});

test('unavailable or malformed upstream results use a clear 503 and brief shared retry delay', async () => {
  for (const fetcher of [async () => new Response('failure', {status:500}), async () => new Response('<html>no</html>'), async () => Response.json([]), async () => new Response('{}', {headers:{'Content-Length':'999999'}}), async () => new Response('x'.repeat(512001))]) {
    const result = await ticketsResponse(request(), {fetcher, cache:null, now});
    assert.equal(result.status, 503); assert.equal(result.headers.get('Retry-After'), '300'); assert.equal((await result.json()).sourceUrl, TICKET_CATALOGUE_URL);
  }
  const cache = cacheStore(); let calls = 0;
  const fetcher = async () => { calls++; throw Error(); };
  await ticketsResponse(request(), {cache, fetcher, now});
  await ticketsResponse(request(), {cache, fetcher, now:now + 1000}); assert.equal(calls, 1);
  await ticketsResponse(request(), {cache, fetcher, now:now + 5 * 60000}); assert.equal(calls, 2);
});

test('cache failures do not hide a valid live catalogue; writes are never sent upstream', async () => {
  const cache = {async match() { throw Error(); }, async put() { throw Error(); }};
  assert.equal((await ticketsResponse(request(), {cache, fetcher:validFetch, now})).status, 200);
  let calls = 0;
  for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
    const result = await ticketsResponse(new Request(request().url, {method}), {cache, fetcher:async () => { calls++; }, now});
    assert.equal(result.status, 405); assert.equal(result.headers.get('Allow'), 'GET');
  }
  assert.equal(calls, 0);
});
