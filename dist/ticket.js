const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const TICKET_LINKS=Object.freeze({
  android:'https://play.google.com/store/apps/details?id=com.modeshift.jsp',
  ios:'https://apps.apple.com/us/app/skopjebus/id6478974997',
  cards:'https://skopjebus.mk/en/app/cards/load/',
  account:'https://skopjebus.mk/en/app/account/',
});
export function ticketAppLink(userAgent='',maxTouchPoints=0){
  if(/Android/i.test(userAgent))return {href:`intent://#Intent;scheme=com.modeshift.jsp;package=com.modeshift.jsp;S.browser_fallback_url=${encodeURIComponent(TICKET_LINKS.android)};end`,label:'Open SkopjeBus',native:true};
  if(/iPhone|iPad|iPod/i.test(userAgent)||(/Macintosh/i.test(userAgent)&&maxTouchPoints>1))return {href:TICKET_LINKS.ios,label:'Get SkopjeBus on the App Store',native:false};
  return {href:TICKET_LINKS.android,label:'Get SkopjeBus for Android',native:false};
}
export function ticketCardMarkup(ticket,groupName){
  if(!ticket||!/^\d+$/.test(String(ticket.id))||typeof ticket.price!=='number'||!Number.isFinite(ticket.price)||ticket.price<0||ticket.currency!=='MKD')return '';
  const name=ticket.name?.en||ticket.name?.mk;
  if(typeof name!=='string'||!name.trim())return '';
  const price=new Intl.NumberFormat('en-GB',{maximumFractionDigits:2}).format(ticket.price);
  return `<button type="button" class="ticket-product" data-ticket-id="${ticket.id}" aria-pressed="false"><span class="ticket-product-top"><span class="ticket-product-zone">${esc(groupName)}</span><span class="ticket-product-check" aria-hidden="true">✓</span></span><strong class="ticket-product-name">${esc(name)}</strong><span class="ticket-product-price">${price}<small>MKD</small></span><span class="ticket-product-bottom">${Number.isSafeInteger(ticket.rides)&&ticket.rides>0?`${ticket.rides} rides`:'Travel pass'}<span aria-hidden="true">↗</span></span></button>`;
}
export function createTicketView(document,fetcher=fetch,userAgent='',maxTouchPoints=0){
  const dialog=document.querySelector('#ticket-dialog');
  const list=document.querySelector('#ticket-products'),filters=document.querySelector('#ticket-filters');
  const status=document.querySelector('#ticket-status'),refresh=document.querySelector('#ticket-refresh');
  const choice=document.querySelector('#ticket-choice'),choiceName=document.querySelector('#ticket-choice-name');
  const choiceNote=document.querySelector('#ticket-choice-note'),launch=document.querySelector('#ticket-launch');
  const app=ticketAppLink(userAgent,maxTouchPoints);
  let groups=[],selectedGroup=null,loadedAt=0,busy=false;
  launch.href=app.href;launch.textContent=app.label;
  if(!app.native){launch.target='_blank';launch.rel='noopener noreferrer';}
  for(const link of document.querySelectorAll('[data-ticket-app]')){
    link.href=app.href;link.textContent=app.label;
    if(!app.native){link.target='_blank';link.rel='noopener noreferrer';}
  }
  const groupLabel=g=>g.name?.en||g.name?.mk||'JSP tickets';
  function render(){
    const current=groups.find(g=>g.id===selectedGroup)||groups[0];
    selectedGroup=current?.id;
    filters.innerHTML=groups.map(g=>`<button type="button" data-ticket-group="${esc(g.id)}" aria-pressed="${g.id===selectedGroup}">${esc(groupLabel(g))} lines</button>`).join('');
    for(const button of filters.querySelectorAll('[data-ticket-group]'))button.onclick=()=>{selectedGroup=groups.find(g=>String(g.id)===button.dataset.ticketGroup)?.id;choice.hidden=true;render();for(const next of filters.querySelectorAll('[data-ticket-group]'))if(next.dataset.ticketGroup===String(selectedGroup))next.focus();};
    list.innerHTML=current?.tickets.map(t=>ticketCardMarkup(t,groupLabel(current))).join('')||'<p class="ticket-empty">No passes are available right now. You can still check in SkopjeBus.</p>';
    for(const button of list.querySelectorAll('[data-ticket-id]'))button.onclick=()=>{
      const ticket=current.tickets.find(t=>String(t.id)===button.dataset.ticketId);
      if(!ticket)return;
      for(const card of list.querySelectorAll('[data-ticket-id]'))card.setAttribute('aria-pressed',String(card===button));
      choiceName.textContent=ticket.name.en||ticket.name.mk;
      choiceNote.textContent='In SkopjeBus, open Tickets → Buy ticket and select this pass. Review its price and terms before paying. Your QR ticket will appear there.';
      choice.hidden=false;choice.scrollIntoView({block:'nearest'});
    };
  }
  async function load(force=false){
    if(busy||(!force&&loadedAt&&Date.now()-loadedAt<30*60000))return;
    busy=true;refresh.disabled=true;list.setAttribute('aria-busy','true');status.textContent='Checking JSP fares…';status.dataset.state='loading';
    try{
      const response=await fetcher('/api/tickets',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(response.status===401){status.textContent='Sign in to Tuka again to load ticket prices.';status.dataset.state='error';return;}
      if(!response.ok)throw Error();
      const data=await response.json();
      if(!Array.isArray(data.groups)||!data.groups.length)throw Error();
      groups=data.groups.filter(g=>g&&['string','number'].includes(typeof g.id)&&g.name&&Array.isArray(g.tickets));
      if(!groups.length)throw Error();
      choice.hidden=true;render();loadedAt=Date.now();
      const checked=Date.parse(data.checkedAt);
      status.textContent=data.stale?'Showing saved fares. Confirm the latest price in SkopjeBus.':Number.isFinite(checked)?'JSP fares · checked '+new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Skopje'}).format(checked)+' Skopje time':'Current JSP fares';
      status.dataset.state=data.stale?'stale':'ready';
    }catch{
      status.textContent=groups.length?'Fares could not be refreshed. Confirm the price in SkopjeBus.':'JSP fares are unavailable right now. Open SkopjeBus to buy a ticket.';status.dataset.state='error';
      if(!groups.length)list.innerHTML='<p class="ticket-empty">The official app is still available below.</p>';
    }finally{busy=false;refresh.disabled=false;list.setAttribute('aria-busy','false');}
  }
  document.querySelector('#ticket-open').onclick=()=>{dialog.showModal();load();};
  document.querySelector('#ticket-close').onclick=()=>dialog.close();
  refresh.onclick=()=>load(true);
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
  return {load};
}
if(typeof document!=='undefined'&&document.querySelector('#ticket-dialog'))createTicketView(document,fetch,navigator.userAgent,navigator.maxTouchPoints);
