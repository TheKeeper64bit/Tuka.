import transport from './worker.js';
import {accessResponse} from './auth.js';

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.protocol === 'http:' && env.PUBLIC_ORIGIN?.startsWith('https://')) {
        return new Response(null, {status:308, headers:{Location:env.PUBLIC_ORIGIN + url.pathname + url.search, 'Cache-Control':'no-store'}});
      }
      const gate = await accessResponse(request, env, message => env.OWNER_EMAIL.send(message));
      if (gate) return gate;
      let response;
      if (url.pathname.startsWith('/api/')) response = await transport.fetch(request);
      else {
        if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405});
        if (url.pathname === '/') url.pathname = '/index.html';
        if (url.pathname === '/login') url.pathname = '/login.html';
        response = await env.ASSETS.fetch(new Request(url, request));
      }
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      headers.set('Vary', 'Cookie');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Referrer-Policy', 'no-referrer');
      headers.set('X-Frame-Options', 'DENY');
      if (url.protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000');
      if (url.pathname === '/login.html') headers.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
      return new Response(response.body, {status:response.status, headers});
    } catch {
      console.error(JSON.stringify({event:'tuka_request_failed'}));
      return Response.json({error:'Tuka is temporarily unavailable. Please try again.'}, {status:503, headers:{'Cache-Control':'no-store'}});
    }
  },
};
