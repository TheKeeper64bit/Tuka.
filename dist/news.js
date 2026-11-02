import {apiURL,apiCredentials} from './config.js?v=1';
import {providerFor,officialNewsURL} from './city-providers.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Skopje'}).format(new Date(value));
const datePart=(value,part)=>new Intl.DateTimeFormat('en-GB',{[part]:part==='month'?'short':'numeric',timeZone:'Europe/Skopje'}).format(new Date(value));
const arrow='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export function articleMarkup(article,index,cityId='skopje'){
  const provider=providerFor(cityId),label=esc(provider.news.label);
  const source=officialNewsURL(article.sourceUrl,cityId);
  if(!source||(!Number.isFinite(Date.parse(article.publishedAt))&&article.kind!=='operator-notice')||!Array.isArray(article.paragraphs))return '';
  const featured=index===0;
  const periods=(article.periods||[]).map(p=>[p.start?'From '+new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:provider.timezone}).format(new Date(p.start*1000)):'',p.end?'until '+new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:provider.timezone}).format(new Date(p.end*1000)):''].filter(Boolean).join(' ')).join(' · ');
  const stamp=article.kind==='operator-notice'?`<div class="news-story-meta"><span class="news-latest">Operator notice</span><span>${esc(periods||'See operator advice for validity')}</span></div>`:featured?`<div class="news-story-meta"><span class="news-latest">Latest announcement</span><time datetime="${esc(article.publishedAt)}">${date(article.publishedAt)}</time></div>`:`<time class="news-date" datetime="${esc(article.publishedAt)}" aria-label="${date(article.publishedAt)}"><span>${datePart(article.publishedAt,'month')}</span><strong>${datePart(article.publishedAt,'day')}</strong><span>${datePart(article.publishedAt,'year')}</span></time>`;
  return `<article class="news-story ${featured?'news-story--featured':'news-story--row'} ${article.kind==='operator-notice'?'news-story--notice':''}" aria-labelledby="news-title-${index}">${stamp}<div class="news-story-content"><h2 id="news-title-${index}">${esc(article.title)}</h2><p class="news-summary">${esc(article.summary)}</p><details class="news-detail"><summary><span class="news-read">Read article</span><span class="news-collapse">Close article</span><span class="news-read-icon">${arrow}</span></summary><div class="news-body" id="news-article-${index}">${article.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}<div class="news-source"><span>${article.aiEdited?'Adapted with Gemini from the official notice.':article.kind==='operator-notice'?'Original operator notice via OVapi.':`Original ${label} notice.`}</span><a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Open ${label} source <span aria-hidden="true">↗</span></a></div></div></details></div></article>`;
}
export function createNewsView(document,fetcher=fetch){
  const list=document.querySelector('#news-list'),status=document.querySelector('#news-status'),refresh=document.querySelector('#news-refresh');
  let loadedAt=0,busy=false,retry=null,active=false,cityId='skopje',version=0;
  async function open(force=false){
    active=true;
    const generation=version,city=cityId,provider=providerFor(city),label=provider.news.label;
    if(busy||(!force&&Date.now()-loadedAt<(city==='tilburg'?30000:30*60000)))return;
    busy=true;refresh.disabled=true;list.setAttribute('aria-busy','true');status.textContent=`Checking ${label} announcements…`;
    if(retry){clearTimeout(retry);retry=null;}
    try{
      const r=await fetcher(apiURL('/api/news'+(city==='skopje'?'':'?city='+encodeURIComponent(city))),{credentials:apiCredentials(),cache:'no-store',signal:AbortSignal.timeout(55000)});
      if(generation!==version)return;
      if(r.status===401){status.textContent='Sign in again to read local news.';return;}
      const data=await r.json();
      if(generation!==version)return;
      if(!r.ok)throw Error();
      if(data.pending){status.textContent='Preparing the latest articles…';if(active)retry=setTimeout(()=>open(true),5000);return;}
      const articles=[];
      for(const article of data.articles||[]){const markup=articleMarkup(article,articles.length,city);if(markup)articles.push(markup);}
      list.innerHTML=articles.length?articles[0]+(articles.length>1?'<div class="news-list-label">More from '+esc(label)+'<span>'+String(articles.length-1)+(articles.length===2?' announcement':' announcements')+'</span></div>'+articles.slice(1).join(''):''):'<div class="news-empty"><strong>You’re all caught up.</strong><p>No local announcements are available yet. Check back soon.</p></div>';
      status.textContent=data.stale?`${label} could not be reached. Showing the last available articles.`:data.checkedAt?'Last checked '+new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:provider.timezone}).format(new Date(data.checkedAt))+' · '+provider.timezone:`Official ${label} announcements`;
      loadedAt=Date.now();
    }catch{if(generation===version&&city==='tilburg')list.innerHTML='<p class="notice">Current notices could not be checked. Use the official operator link below.</p>';if(generation===version)status.textContent=`${label} news could not be refreshed. Please try again shortly.`;}
    finally{if(generation===version){busy=false;refresh.disabled=false;list.setAttribute('aria-busy','false');}}
  }
  refresh.onclick=()=>open(true);
  return {open,setCity(next){
    if(next===cityId)return;cityId=next;version++;loadedAt=0;busy=false;if(retry){clearTimeout(retry);retry=null;}list.innerHTML='';status.textContent='';refresh.disabled=false;
    const provider=providerFor(cityId);refresh.setAttribute('aria-label','Refresh '+provider.news.label+' notices');
    const footer=document.querySelector('.news-footer');if(footer)footer.innerHTML=cityId==='tilburg'?'Validity comes from the operator. Publication dates are not supplied. <a href="'+provider.news.url+'" target="_blank" rel="noopener noreferrer">Official operator notices ↗</a>':'Dates reflect the original publication. <a href="'+provider.news.url+'" target="_blank" rel="noopener noreferrer">Official website ↗</a>';
    for(const [selector,text] of [['.news-eyebrow',provider.name+' · PUBLIC TRANSPORT'],['.news-intro','Official announcements and service notices for '+provider.name+'.'],['.news-source-mark strong',provider.news.label]]){const el=document.querySelector(selector);if(el)el.textContent=text;}
    const link=document.querySelector('.news-footer a');if(link){link.href=provider.news.url;link.textContent=provider.news.label+' official website ↗';}
    if(active)void open();
  },close(){active=false;if(retry){clearTimeout(retry);retry=null;}}};
}
