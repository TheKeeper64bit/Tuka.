import {CITY_CATALOG, publicCities} from './meta-catalog.js';

const encoder = new TextEncoder();

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function unauthorized() {
  return new Response('Authentication required', {
    status: 401,
    headers: {'WWW-Authenticate': 'Basic realm="Tuka Meta Hackathon"', 'Cache-Control': 'no-store'},
  });
}

async function authorized(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded;
  try { decoded = atob(header.slice(6)); } catch { return false; }
  const split = decoded.indexOf(':');
  if (split < 1) return false;
  const user = decoded.slice(0, split);
  const password = decoded.slice(split + 1);
  const expectedUser = String(env.META_AUTH_USER || '');
  const expectedPassword = String(env.META_AUTH_PASSWORD || '');
  return constantTimeEqual(user, expectedUser) && constantTimeEqual(password, expectedPassword);
}

function json(data, status = 200) {
  return Response.json(data, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
}

function cleanMessage(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 1200);
}

const networkTool = {
  type: 'function',
  function: {
    name: 'get_network_profiles',
    description: 'Return verified Tuka city/provider profiles. Use this before making claims about coverage, live data, or timezones.',
    parameters: {type: 'object', properties: {}, additionalProperties: false},
  },
};

function toolResult() {
  return JSON.stringify(publicCities().map(city => ({
    id: city.id, name: city.name, timezone: city.timezone,
    provider: city.provider, capabilities: city.capabilities,
    status: city.status, description: city.description,
  })));
}

async function askMeta(message, env) {
  const token = env.MODEL_API_KEY || env.META_AI_TOKEN || env.META_API_KEY;
  if (!token) return {error: 'Meta AI is not configured for this deployment.', status: 503};
  const endpoint = String(env.META_API_URL || 'https://api.meta.ai/v1/chat/completions').replace(/\/$/, '');
  const model = String(env.META_MODEL || 'muse-spark-1.3');
  const system = [
    'You are Tuka Copilot, a transit assistant for a hackathon demo.',
    'Use only verified city/provider profiles and the supplied app context.',
    'Never invent a departure, arrival, route, fare, disruption, or guarantee.',
    'If a live result is not supplied, say that it is unavailable and direct the rider to the planner.',
    'Be concise, practical, and explain the timezone or data freshness when relevant.',
  ].join(' ');
  const base = {model, temperature: 0.2, max_completion_tokens: 760, tool_choice: 'auto', parallel_tool_calls: false,
    messages: [{role: 'system', content: system}, {role: 'user', content: message}], tools: [networkTool]};
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
    const messages = [...base.messages, assistant, ...calls.map(call => ({role: 'tool', tool_call_id: call.id, name: call.function?.name || 'get_network_profiles', content: toolResult()}))];
    response = await call({...base, messages, tools: [networkTool]});
    if (!response.ok) {
      // A provider/model may decline a replayed tool turn. Keep the answer
      // grounded by retrying with the verified tool result as context and no
      // further tool request.
      response = await call({...base, tools: [], messages: [base.messages[0], base.messages[1], {role: 'user', content: `Verified network profiles from Tuka: ${toolResult()}`} ]});
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
    if (!(await authorized(request, env))) return unauthorized();
    const url = new URL(request.url);
    if (url.pathname === '/api/cities' && request.method === 'GET') return json({cities: publicCities()});
    if (url.pathname === '/api/meta/ask' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({error: 'Send a JSON request.'}, 400); }
      const message = cleanMessage(body?.message);
      if (!message) return json({error: 'Ask Tuka Copilot a question first.'}, 400);
      const result = await askMeta(message, env);
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
