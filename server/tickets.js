// Public catalogue only. Account, payment and ticket activation stay with JSP.
export const TICKET_CATALOGUE_URL = 'https://www.modeshift.app/api/v1/9814b106-2afe-47c8-919b-bdec6a5e521e/transport/public/tickets/groups?includeDynamicFares=true';
const FRESH_MS = 30 * 60 * 1000, STALE_MS = 24 * 60 * 60 * 1000, RETRY_MS = 5 * 60 * 1000;
const MAX_BYTES = 512000;

function text(value) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) : '';
}
function names(record) {
  const original = text(record?.name), translations = record?.translations?.name;
  return {en:text(translations?.en) || original, mk:text(translations?.mk) || original};
}

export function normalizeTicketGroups(data) {
  if (!Array.isArray(data) || data.length > 50) throw Error('Invalid ticket catalogue');
  const groups = [], seen = new Set();
  for (const [index, group] of data.entries()) {
    if (!Array.isArray(group?.ticketDefinitions) || group.ticketDefinitions.length > 100) continue;
    const name = names(group), tickets = [];
    if (!name.en || !name.mk) continue;
    for (const ticket of group.ticketDefinitions) {
      if (!ticket || ticket.status !== 1 || ticket.isDynamicFare === true || !Number.isSafeInteger(ticket.id) || ticket.id <= 0 || seen.has(ticket.id)) continue;
      const ticketName = names(ticket), price = ticket.activePeriod?.price ?? ticket.price;
      if (!ticketName.en || !ticketName.mk || typeof price !== 'number' || !Number.isFinite(price) || price < 0 || !/^[A-Z]{3}$/.test(ticket.currency || '')) continue;
      seen.add(ticket.id);
      tickets.push({
        id:String(ticket.id), name:ticketName, price, currency:ticket.currency,
        rides:Number.isSafeInteger(ticket.charges) && ticket.charges > 0 ? ticket.charges : null,
      });
    }
    if (tickets.length) {
      const fareRuleId = group.ticketDefinitions[0]?.fareRuleId;
      groups.push({id:Number.isSafeInteger(fareRuleId) ? String(fareRuleId) : 'group-' + index, name, tickets});
    }
  }
  // An empty or changed upstream format must not replace a previously useful cache.
  if (!groups.length) throw Error('No available tickets');
  return groups;
}

async function readCatalogue(fetcher) {
  const upstream = await fetcher(TICKET_CATALOGUE_URL, {
    method:'GET', headers:{Accept:'application/json'}, redirect:'manual', signal:AbortSignal.timeout(12000),
  });
  if (!upstream.ok || !upstream.body || Number(upstream.headers.get('Content-Length')) > MAX_BYTES) throw Error('Ticket catalogue unavailable');
  const reader = upstream.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw Error('Ticket catalogue too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return normalizeTicketGroups(JSON.parse(new TextDecoder().decode(bytes)));
}

function response(payload, status = 200) {
  return Response.json(payload, {status, headers:{'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...(status === 503 ? {'Retry-After':'300'} : {})}});
}
function unavailable() {
  return response({groups:[], sourceUrl:TICKET_CATALOGUE_URL, error:'JSP ticket prices are temporarily unavailable. You can still continue to SkopjeBus.'}, 503);
}
async function store(cache, key, value, ttl) {
  if (!cache) return;
  try {
    await cache.put(key, Response.json(value, {headers:{'Cache-Control':'public, max-age=' + Math.max(1, Math.floor(ttl / 1000))}}));
  } catch { /* Cache eviction or an unavailable local cache must not hide live fares. */ }
}

// Cache API entries are shared per Cloudflare location, with no user/session data.
// Keep entries for a day and evaluate freshness ourselves so an outage can use stale fares.
export async function ticketsResponse(request, {fetcher = fetch, cache = globalThis.caches?.default, now = Date.now()} = {}) {
  if (request.method !== 'GET') return new Response('Method not allowed', {status:405, headers:{Allow:'GET'}});
  const key = new Request(new URL('/__tuka-cache/ticket-catalogue-v1', request.url));
  let previous = null;
  try { previous = await (await cache?.match(key))?.json() || null; } catch { /* Fetch a fresh copy when the cache cannot be read. */ }
  const old = previous?.payload, age = old ? now - Date.parse(old.checkedAt) : Infinity;
  const usable = age >= 0 && age < STALE_MS && Array.isArray(old?.groups) && old.groups.length > 0;
  if (usable && (age < FRESH_MS || previous.retryAt > now)) return response({...old, stale:age >= FRESH_MS});
  if (!old && previous?.retryAt > now) return unavailable();
  try {
    const groups = await readCatalogue(fetcher);
    const payload = {groups, checkedAt:new Date(now).toISOString(), sourceUrl:TICKET_CATALOGUE_URL};
    await store(cache, key, {payload, retryAt:0}, STALE_MS);
    return response({...payload, stale:false});
  } catch {
    if (usable) {
      await store(cache, key, {payload:old, retryAt:now + RETRY_MS}, STALE_MS - age);
      return response({...old, stale:true});
    }
    await store(cache, key, {payload:null, retryAt:now + RETRY_MS}, RETRY_MS);
    return unavailable();
  }
}
