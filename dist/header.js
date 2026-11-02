// Keep frequent actions visible and move secondary controls into one disclosure.
// Move the original nodes so existing install, ticket, language and theme handlers survive.
export function polishHeader(document){
 const header=document.querySelector('body > header'),tools=header?.querySelector('.headtools');
 if(!tools||tools.querySelector('.header-more'))return;
 header.classList.add('header-polished');
 const more=document.createElement('details');more.className='header-more';
 const summary=document.createElement('summary');summary.className='header-more-toggle';summary.setAttribute('aria-label','More app options');summary.title='More app options';summary.textContent='•••';
 const panel=document.createElement('div');panel.className='header-menu';
 const label=document.createElement('p');label.className='header-menu-label';label.textContent='App options';panel.append(label);
 const status=tools.querySelector('#feedstatus');if(status)panel.append(status);
 const actions=document.createElement('div');actions.className='header-menu-actions';
 for(const selector of ['[data-language-open]','#ticket-open','#install-app','#theme']){
  const button=tools.querySelector(selector);if(!button)continue;
  if(selector==='[data-language-open]')button.dataset.actionLabel='Language';
  if(selector==='#theme')button.dataset.actionLabel='Appearance';
  actions.append(button);
 }
 panel.append(actions);more.append(summary,panel);tools.append(more);
 more.addEventListener('toggle',()=>summary.setAttribute('aria-expanded',String(more.open)));
 more.addEventListener('click',event=>{if(event.target.closest('button'))more.open=false;});
 document.addEventListener('click',event=>{if(more.open&&!more.contains(event.target))more.open=false;});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&more.open){more.open=false;summary.focus();}});
}
