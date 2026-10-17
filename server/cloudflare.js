import {walkingResponse} from './walking.js';
import transport from './worker.js';
import {newsResponse} from './news.js';
import {ticketsResponse} from './tickets.js';

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.protocol === 'http:' && env.PUBLIC_ORIGIN?.startsWith('https://')) {
        return new Response(null, {status:308, headers:{Location:env.PUBLIC_ORIGIN + url.pathname + url.search, 'Cache-Control':'no-store'}});
      }
      let response;
      if (['/login','/login.html'].includes(url.pathname)) {
        const next=url.searchParams.get('next')||'/';
        const target=next.startsWith('/?')&&next.length<=1800&&!/[\x00-\x1f\x7f]/.test(next)?next:'/';
        response=new Response(null,{status:303,headers:{Location:target}});
      }
      // Older open tabs and service workers may still check their session.
      // Public access needs no cookie and never creates an account or sends mail.
      else if(url.pathname==='/auth/session'&&['GET','HEAD'].includes(request.method)) response=Response.json({authenticated:true,public:true});
      else if(url.pathname.startsWith('/auth/')) response=Response.json({public:true,error:'Access codes are no longer required. Open Tuka directly.',redirect:'/'},{status:410});
      else if (url.pathname === '/api/news') response = await newsResponse(request, env);
      else if (url.pathname === '/api/walk') response = await walkingResponse(request, env);
      else if (url.pathname === '/api/tickets') response = await ticketsResponse(request);
      else if (url.pathname.startsWith('/api/')) response = await transport.fetch(request);
      else {
        if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405});
        if (url.pathname === '/') url.pathname = '/index.html';
        response = await env.ASSETS.fetch(new Request(url, request));
      }
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Referrer-Policy', 'no-referrer');
      headers.set('X-Frame-Options', 'DENY');
      if (url.protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000');
      return new Response(request.method==='HEAD'?null:response.body, {status:response.status, headers});
    } catch {
      console.error(JSON.stringify({event:'tuka_request_failed'}));
      return Response.json({error:'Tuka is temporarily unavailable. Please try again.'}, {status:503, headers:{'Cache-Control':'no-store'}});
    }
  },
};
