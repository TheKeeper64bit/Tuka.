import {CITY_CATALOG, publicCities} from './meta-catalog.js';

const SESSION = 'tuka_meta_session';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function unauthorized() {
  return Response.json({error: 'Sign in to the Meta hackathon build.'}, {status: 401, headers: {'Cache-Control': 'no-store'}});
}

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

async function issueSession(user, secret) {
  const payload = base64url(encoder.encode(JSON.stringify({user, expires: Date.now() + 1000 * 60 * 60 * 12})));
  return `${payload}.${await sign(payload, secret)}`;
}

async function validSession(request, env) {
  const cookies = request.headers.get('Cookie') || '';
  const value = cookies.split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION}=`))?.slice(SESSION.length + 1);
  if (!value) return false;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return false;
  let parsed;
  try { parsed = JSON.parse(decoder.decode(fromBase64url(payload))); } catch { return false; }
  if (!parsed?.user || parsed.expires < Date.now()) return false;
  const expected = await sign(payload, String(env.META_AUTH_PASSWORD || ''));
  return constantTimeEqual(signature, expected) && parsed.user === String(env.META_AUTH_USER || '');
}

function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/';
}

async function loginPage(request, env) {
  const response = await env.ASSETS.fetch(new Request(new URL('/meta-login', request.url), request));
  const next = safeNext(new URL(request.url).searchParams.get('next'));
  const html = await response.text();
  const error = new URL(request.url).searchParams.get('error') === 'invalid' ? 'The username or password is not correct.' : '';
  return new Response(html.replace('__NEXT__', next.replace(/&/g, '&amp;').replace(/"/g, '&quot;')).replace('{{ERROR}}', error), {status: response.status, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY'}});
}

function json(data, status = 200) {
  return Response.json(data, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
}

function cleanMessage(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 1200);
}

function mbtaUrl(env, path, params = {}) {
  const base = String(env.MBTA_API_BASE || 'https://api-v3.mbta.com').replace(/\/$/, '');
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') url.searchParams.set(key, value);
  if (env.MBTA_API_KEY) url.searchParams.set('api_key', String(env.MBTA_API_KEY));
  return url;
}

function mbtaRelationship(item, type) {
  return item?.relationships?.[type]?.data?.id || '';
}

async function bostonRealtime(request, env) {
  const stop = new URL(request.url).searchParams.get('stop') || '';
  if (stop && !/^[A-Za-z0-9:_-]{1,120}$/.test(stop)) return json({error: 'Invalid Boston stop id.'}, 400);
  const headers = {'Accept': 'application/vnd.api+json'};
  const fetchFeed = async (path, params) => {
    try {
      const response = await fetch(mbtaUrl(env, path, params), {headers, signal: AbortSignal.timeout(9000)});
      if (!response.ok) return {ok: false, status: response.status};
      return {ok: true, data: await response.json()};
    } catch { return {ok: false, status: 0}; }
  };
  // MBTA route types: 0 subway, 1 subway, 2 commuter rail, 3 bus,
  // 4 ferry, 5 cable car. We keep the static demo snapshot intentionally
  // small, but the live layer should not silently discard non-bus service.
  const routeTypes = '0,1,2,3,4,5';
  const predictionsRequest = stop ? fetchFeed('/predictions', {
    'filter[stop]': stop, 'filter[route_type]': routeTypes, include: 'route,trip,stop', sort: 'departure_time', 'page[limit]': '40',
  }) : Promise.resolve({ok: true, data: {data: []}});
  const vehiclesRequest = fetchFeed('/vehicles', {'filter[route_type]': routeTypes, include: 'route,trip', 'page[limit]': '400'});
  const [predictions, vehicles] = await Promise.all([predictionsRequest, vehiclesRequest]);
  const included = new Map((predictions.data?.included || []).map(item => [String(item.id), item]));
  const vehicleIncluded = new Map((vehicles.data?.included || []).map(item => [String(item.id), item]));
  const routeLabel = (id, map) => map.get(String(id))?.attributes?.short_name || map.get(String(id))?.attributes?.long_name || null;
  const routeType = (id, map) => map.get(String(id))?.attributes?.type ?? null;
  const predictionRows = predictions.ok && Array.isArray(predictions.data?.data) ? predictions.data.data.map(item => {
    const a = item.attributes || {};
    const route = mbtaRelationship(item, 'route');
    return {id: String(item.id || ''), route, routeName: routeLabel(route, included), routeType: routeType(route, included), trip: mbtaRelationship(item, 'trip'), stop: mbtaRelationship(item, 'stop'), departureTime: a.departure_time || null, arrivalTime: a.arrival_time || null, status: a.status || null, direction: a.direction_id ?? null};
  }).filter(row => row.departureTime || row.arrivalTime) : [];
  const vehicleRows = vehicles.ok && Array.isArray(vehicles.data?.data) ? vehicles.data.data.map(item => {
    const a = item.attributes || {};
    const routeId = mbtaRelationship(item, 'route');
    return {id: String(item.id || ''), label: a.label || item.id || '', routeId, routeName: routeLabel(routeId, vehicleIncluded), routeType: routeType(routeId, vehicleIncluded), tripId: mbtaRelationship(item, 'trip'), lat: Number(a.latitude), lon: Number(a.longitude), status: a.current_status || null, updatedAt: a.updated_at || null, occupancy: a.occupancy_status || null};
  }).filter(row => Number.isFinite(row.lat) && Number.isFinite(row.lon)) : [];
  const liveAvailable = predictions.ok || vehicles.ok;
  return json({source: 'MBTA V3 API', fetchedAt: new Date().toISOString(), liveAvailable, routeTypes, message: liveAvailable ? 'Live MBTA data received.' : 'MBTA realtime is unavailable right now.', predictions: predictionRows, vehicles: vehicleRows, errors: liveAvailable ? undefined : {predictions: predictions.status, vehicles: vehicles.status}});
}

const networkTool = {
  type: 'function',
  function: {
    name: 'get_network_profiles',
    description: 'Return verified Tuka city/provider profiles. Use this before making claims about coverage, live data, or timezones.',
    parameters: {type: 'object', properties: {}, additionalProperties: false},
  },
};

const cityContextTool = {
  type: 'function',
  function: {
    name: 'get_city_context',
    description: 'Return verified context for the selected Tuka city. For Boston, include a stop id only when the rider selected one so live MBTA data can be checked.',
    parameters: {type: 'object', properties: {
      city_id: {type: 'string', enum: ['skopje', 'boston']},
      stop_id: {type: 'string', description: 'Optional MBTA stop id selected in the Boston map.'},
    }, required: ['city_id'], additionalProperties: false},
  },
};

function toolResult() {
  return JSON.stringify(publicCities().map(city => ({
    id: city.id, name: city.name, timezone: city.timezone,
    provider: city.provider, capabilities: city.capabilities,
    status: city.status, description: city.description,
  })));
}

async function cityContext(args, env) {
  const city = CITY_CATALOG.find(item => item.id === String(args?.city_id || '')) || CITY_CATALOG[0];
  const result = {city: publicCities().find(item => item.id === city.id), dataFreshness: city.id === 'boston' ? 'Official MBTA GTFS snapshot at build time; live MBTA V3 checked on request.' : 'Tuka live provider data is available through the main planner.'};
  if (city.id === 'boston' && args?.stop_id && /^[A-Za-z0-9:_-]{1,120}$/.test(String(args.stop_id))) {
    const response = await bostonRealtime(new Request(`https://tuka.local/api/boston/realtime?stop=${encodeURIComponent(args.stop_id)}`), env);
    result.live = await response.json();
  }
  return JSON.stringify(result);
}

async function askMeta(message, context, env) {
  const token = env.MODEL_API_KEY || env.META_AI_TOKEN || env.META_API_KEY;
  if (!token) return {error: 'Meta AI is not configured for this deployment.', status: 503};
  const endpoint = String(env.META_API_URL || 'https://api.meta.ai/v1/chat/completions').replace(/\/$/, '');
  const model = String(env.META_MODEL || 'muse-spark-1.3');
  const system = [
    'You are Tuka Copilot, a transit assistant for a hackathon demo.',
    'Use only verified city/provider profiles and the supplied app context.',
    'Never invent a departure, arrival, route, fare, disruption, or guarantee.',
    'If a live result is not supplied, say that it is unavailable and direct the rider to the planner.',
    'The selected city and stop are context, not permission to invent data. Use get_city_context before making a city-specific claim.',
    'Be concise, practical, and explain the timezone or data freshness when relevant.',
  ].join(' ');
  const base = {model, temperature: 0.2, max_completion_tokens: 760, tool_choice: 'auto', parallel_tool_calls: false,
    messages: [{role: 'system', content: system}, {role: 'user', content: `Selected city: ${context.cityId || 'skopje'}${context.stopId ? `; selected stop: ${context.stopId}` : ''}\nRider question: ${message}`}], tools: [networkTool, cityContextTool]};
  const call = async body => fetch(endpoint, {method: 'POST', headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(18000)});
  let response = await call(base);
  if (!response.ok) return {error: 'Meta AI could not answer right now.', status: response.status === 429 ? 429 : 502};
  let data = await response.json();
  let choice = data?.choices?.[0];
  const calls = choice?.message?.tool_calls || [];
  if (calls.length) {
    // Replay only the fields required by the Chat Completions conversation
    // schema. Some Meta models include nullable provider fields that cannot be
    // sent back in a tool-call turn.
    const assistant = {
      role: 'assistant',
      content: choice.message.content || '',
      tool_calls: calls.map(call => ({
        id: String(call.id), type: 'function',
        function: {name: String(call.function?.name || 'get_network_profiles'), arguments: String(call.function?.arguments || '{}')},
      })),
    };
    const messages = [...base.messages, assistant, ...await Promise.all(calls.map(async call => {
      const name = call.function?.name || 'get_network_profiles';
      let content = toolResult();
      if (name === 'get_city_context') {
        let args = {};
        try { args = JSON.parse(call.function?.arguments || '{}'); } catch {}
        content = await cityContext(args, env);
      }
      return {role: 'tool', tool_call_id: call.id, name, content};
    }))];
    response = await call({...base, messages, tools: [networkTool, cityContextTool]});
    if (!response.ok) {
      // A provider/model may decline a replayed tool turn. Keep the answer
      // grounded by retrying with the verified tool result as context and no
      // further tool request.
      response = await call({...base, tools: [], messages: [base.messages[0], base.messages[1], {role: 'user', content: `Verified Tuka context: ${toolResult()}`} ]});
      if (!response.ok) return {error: 'Meta AI could not finish the verified answer.', status: 502};
    }
    data = await response.json();
    choice = data?.choices?.[0];
  }
  const answer = cleanMessage(choice?.message?.content);
  if (!answer) return {error: 'Meta AI returned no answer.', status: 502};
  return {answer, model: data.model || model};
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/login' && request.method === 'GET') return loginPage(request, env);
    if (url.pathname === '/auth/login' && request.method === 'POST') {
      let form;
      try { form = await request.formData(); } catch { return Response.redirect(new URL('/login?error=invalid', request.url), 303); }
      const user = String(form.get('username') || '');
      const password = String(form.get('password') || '');
      if (!constantTimeEqual(user, String(env.META_AUTH_USER || '')) || !constantTimeEqual(password, String(env.META_AUTH_PASSWORD || ''))) return Response.redirect(new URL('/login?error=invalid', request.url), 303);
      const cookie = await issueSession(user, String(env.META_AUTH_PASSWORD || ''));
      const destination = safeNext(form.get('next'));
      return new Response(null, {status: 303, headers: {'Location': destination, 'Set-Cookie': `${SESSION}=${cookie}; Max-Age=43200; Path=/; HttpOnly; Secure; SameSite=Lax`, 'Cache-Control': 'no-store'}});
    }
    if (url.pathname === '/auth/logout') return new Response(null, {status: 303, headers: {'Location': '/login', 'Set-Cookie': `${SESSION}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`, 'Cache-Control': 'no-store'}});
    if (!(await validSession(request, env))) {
      if (url.pathname.startsWith('/api/')) return unauthorized();
      return Response.redirect(new URL(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, request.url), 303);
    }
    if (url.pathname === '/api/cities' && request.method === 'GET') return json({cities: publicCities()});
    if (url.pathname === '/boston-snapshot.json' && request.method === 'GET') return env.ASSETS.fetch(new Request(url, request));
    if (url.pathname === '/api/boston/realtime' && request.method === 'GET') return bostonRealtime(request, env);
    if (url.pathname === '/api/meta/ask' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({error: 'Send a JSON request.'}, 400); }
      const message = cleanMessage(body?.message);
      if (!message) return json({error: 'Ask Tuka Copilot a question first.'}, 400);
      const cityId = ['skopje', 'boston'].includes(String(body?.cityId)) ? String(body.cityId) : 'boston';
      const stopId = typeof body?.stopId === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(body.stopId) ? body.stopId : '';
      const result = await askMeta(message, {cityId, stopId}, env);
      return result.error ? json({error: result.error}, result.status) : json(result);
    }
    if (url.pathname.startsWith('/api/')) return json({error: 'Not found'}, 404);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status: 405});
    const response = await env.ASSETS.fetch(new Request(url, request));
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'SAMEORIGIN');
    headers.set('Referrer-Policy', 'same-origin');
    return new Response(request.method === 'HEAD' ? null : response.body, {status: response.status, headers});
  },
};
