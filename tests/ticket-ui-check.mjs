import test from 'node:test';
import assert from 'node:assert/strict';
import {ticketAppLink,ticketCardMarkup,createTicketView,TICKET_LINKS} from '../dist/ticket.js';

const pass={id:'325',name:{en:'10 Rides City Lines',mk:'Градски линии'},price:250,currency:'MKD',rides:10};
test('ticket markup escapes official text and rejects invalid identifiers and fares',()=>{
  const markup=ticketCardMarkup({...pass,name:{en:'<img src=x onerror=alert(1)>'}},'City & all');
  assert(!markup.includes('<img'));assert(markup.includes('&lt;img'));assert(markup.includes('City &amp; all'));
  assert(markup.includes('250'));assert(markup.includes('10 rides'));
  for(const change of [{id:'" onclick="bad'},{price:NaN},{price:-1},{currency:'<x>'}])assert.equal(ticketCardMarkup({...pass,...change},'City'),'');
});
test('Android handoff is explicit, package-scoped and has the official store fallback',()=>{
  const link=ticketAppLink('Mozilla Android Chrome');
  assert(link.native);assert(link.href.includes('scheme=com.modeshift.jsp;package=com.modeshift.jsp;'));
  assert(link.href.includes('S.browser_fallback_url='+encodeURIComponent(TICKET_LINKS.android)));
  assert.equal(ticketAppLink('iPhone').href,TICKET_LINKS.ios);
  assert.equal(ticketAppLink('Mozilla Macintosh Safari',5).href,TICKET_LINKS.ios);
  assert.equal(ticketAppLink('Linux').href,TICKET_LINKS.android);
});
function setup(fetcher){
  const nodes=new Map();
  const document={querySelector(selector){
    if(!nodes.has(selector))nodes.set(selector,{dataset:{},innerHTML:'',textContent:'',setAttribute(){},querySelectorAll(){return [];},addEventListener(){},showModal(){},close(){}});
    return nodes.get(selector);
  },querySelectorAll(){return [];}};
  return {nodes,view:createTicketView(document,fetcher,'Android')};
}
test('catalogue loading uses the authenticated API and does not reload on every open',async()=>{
  let calls=0;
  const {nodes,view}=setup(async(url,options)=>{
    calls++;assert.equal(url,'/api/tickets');assert.equal(options.credentials,'same-origin');
    return Response.json({groups:[{id:'37',name:{en:'City'},tickets:[pass]}],checkedAt:'2026-10-17T12:00:00Z',stale:false});
  });
  await view.load();await view.load();
  assert.equal(calls,1);assert(nodes.get('#ticket-products').innerHTML.includes('10 Rides City Lines'));
  assert.equal(nodes.get('#ticket-status').dataset.state,'ready');
  await view.load(true);assert.equal(calls,2);
});
test('an unavailable catalogue keeps the official app handoff usable and shows an honest error',async()=>{
  const {nodes,view}=setup(async()=>new Response('',{status:503}));
  await view.load();
  assert.equal(nodes.get('#ticket-status').dataset.state,'error');
  assert(nodes.get('#ticket-status').textContent.includes('unavailable'));
  assert(nodes.get('#ticket-launch').href.startsWith('intent://'));
  assert.equal(nodes.get('#ticket-refresh').disabled,false);
});
