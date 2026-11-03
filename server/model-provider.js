// Server-only credentials. Baseten model selection is explicit because tool support
// and available models vary by account. Never forward a Meta token to Baseten.
export function modelProviders(env) {
  const providers = [];
  const token = env.MODEL_API_KEY || env.META_AI_TOKEN || env.META_API_KEY;
  if (token) providers.push({name: 'meta', token, endpoint: env.META_API_URL || 'https://api.meta.ai/v1/chat/completions', model: env.META_MODEL || 'muse-spark-1.3'});
  if (env.BASETEN_API_KEY && env.BASETEN_MODEL?.trim()) providers.push({name: 'baseten', token: env.BASETEN_API_KEY, endpoint: 'https://inference.baseten.co/v1/chat/completions', model: env.BASETEN_MODEL.trim()});
  const ordered=(env.MODEL_PRIMARY_PROVIDER||env.MODEL_PROVIDER)==='baseten'?providers.sort((a,b)=>Number(b.name==='baseten')-Number(a.name==='baseten')):providers;
  return String(env.MODEL_FALLBACK_ENABLED).toLowerCase()==='false'?ordered.slice(0,1):ordered;
}

export async function journeyCompletion(env, body, {fetcher = fetch} = {}) {
  const providers = modelProviders(env);
  if (!providers.length) return {response: null, provider: null};
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    try {
      const payload={...body,model:p.model};
      if(p.name==='baseten'){
        payload.max_tokens=payload.max_tokens??payload.max_completion_tokens;
        delete payload.max_completion_tokens;
      }else if(payload.tool_choice&&typeof payload.tool_choice==='object'){
        // Meta's deployed model accepts auto; the caller still validates the exact tool.
        payload.tool_choice='auto';
      }
      const response = await fetcher(p.endpoint, {
        method: 'POST', redirect: 'manual',
        headers: {Authorization: `Bearer ${p.token}`, 'Content-Type': 'application/json'},
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify(payload),
      });
      // Retry only availability/auth failures. A bad schema or invalid model
      // output must remain visible rather than silently changing its meaning.
      if (i + 1 < providers.length && [401, 403, 408, 429, 500, 502, 503, 504].includes(response.status)) {
        await response.body?.cancel();
        continue;
      }
      return {response, provider: p.name};
    } catch {
      if (i + 1 === providers.length) throw Object.assign(new Error('Journey interpretation is unavailable. Use the planner fields.'), {status: 502});
    }
  }
}
