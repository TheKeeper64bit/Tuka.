import transport from './worker.js';
import {newsResponse} from './news.js';
import {ticketsResponse} from './tickets.js';
import {walkingResponse} from './walking.js';

export const PAGES_ORIGIN='https://thekeeper64bit.github.io';
const routes=new Map([
  ['/api/news',[]],['/api/tickets',[]],['/api/network',[]],['/api/live',[]],
  ['/api/arrivals',['stop']],['/api/walk',['from','to']],
]);
const methods='GET, HEAD, OPTIONS';
function finish(request,response,origin){
  const headers=new Headers(response.headers);
  headers.delete('Set-Cookie');
  headers.delete('Access-Control-Allow-Credentials');
  headers.set('Cache-Control','no-store');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','no-referrer');
  headers.set('Vary','Origin');
  if(origin===PAGES_ORIGIN)headers.set('Access-Control-Allow-Origin',PAGES_ORIGIN);
  return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
}

// The same fixed handlers and D1 budgets serve both apps. This Worker has no
// asset, account, payment, session or email routes and never forwards credentials.
export function createPublicApi({news=newsResponse,tickets=ticketsResponse,walk=walkingResponse,live=transport.fetch}={}){
  return {async fetch(request,env){
    const url=new URL(request.url),origin=request.headers.get('Origin');
    const done=response=>finish(request,response,origin);
    if(origin&&origin!==PAGES_ORIGIN)return done(new Response('Origin not allowed',{status:403}));
    const query=routes.get(url.pathname);
    if(!query)return done(new Response('Not found',{status:404}));
    if(!['GET','HEAD','OPTIONS'].includes(request.method))return done(new Response('Method not allowed',{status:405,headers:{Allow:methods}}));
    if(request.method==='OPTIONS'){
      const method=request.headers.get('Access-Control-Request-Method');
      const headers=(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
      if(!origin||!['GET','HEAD'].includes(method)||headers.some(h=>!['accept','content-type'].includes(h)))return done(new Response('Preflight not allowed',{status:403}));
      return done(new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':methods,'Access-Control-Allow-Headers':'Accept, Content-Type','Access-Control-Max-Age':'600'}}));
    }
    if([...url.searchParams.keys()].some(key=>!query.includes(key))||query.some(key=>url.searchParams.getAll(key).length!==1))return done(Response.json({error:'Invalid query parameters'},{status:400}));
    // Construct a clean read request: no cookies, bearer tokens or client headers.
    const read=new Request(url,{method:'GET',headers:{Accept:'application/json'}});
    try{
      const response=url.pathname==='/api/news'?await news(read,env):
        url.pathname==='/api/tickets'?await tickets(read):
        url.pathname==='/api/walk'?await walk(read,env):await live(read);
      return done(response);
    }catch{
      console.error(JSON.stringify({event:'tuka_public_api_failed',path:url.pathname}));
      return done(Response.json({error:'Tuka is temporarily unavailable. Please try again.'},{status:503}));
    }
  }};
}
export default createPublicApi();
