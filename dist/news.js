const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Skopje'}).format(new Date(value));
const datePart=(value,part)=>new Intl.DateTimeFormat('en-GB',{[part]:part==='month'?'short':'numeric',timeZone:'Europe/Skopje'}).format(new Date(value));
const arrow='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function sourceUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='skopjebus.mk'&&!u.username&&!u.password&&!u.port?u.href:null;}catch{return null;}}
export function articleMarkup(article,index){
  const source=sourceUrl(article.sourceUrl);
  if(!source||!Number.isFinite(Date.parse(article.publishedAt))||!Array.isArray(article.paragraphs))return '';
  const featured=index===0;
  const stamp=featured?`<div class="news-story-meta"><span class="news-latest">Latest announcement</span><time datetime="${esc(article.publishedAt)}">${date(article.publishedAt)}</time></div>`:`<time class="news-date" datetime="${esc(article.publishedAt)}" aria-label="${date(article.publishedAt)}"><span>${datePart(article.publishedAt,'month')}</span><strong>${datePart(article.publishedAt,'day')}</strong><span>${datePart(article.publishedAt,'year')}</span></time>`;
  return `<article class="news-story ${featured?'news-story--featured':'news-story--row'}" aria-labelledby="news-title-${index}">${stamp}<div class="news-story-content"><h2 id="news-title-${index}">${esc(article.title)}</h2><p class="news-summary">${esc(article.summary)}</p><details class="news-detail"><summary><span class="news-read">Read article</span><span class="news-collapse">Close article</span><span class="news-read-icon">${arrow}</span></summary><div class="news-body" id="news-article-${index}">${article.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}<div class="news-source"><span>${article.aiEdited?'Adapted with Gemini from the official notice.':'Original JSP notice.'}</span><a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Read on JSP’s website <span aria-hidden="true">↗</span></a></div></div></details></div></article>`;
}
export function createNewsView(document,fetcher=fetch){
  const list=document.querySelector('#news-list'),status=document.querySelector('#news-status'),refresh=document.querySelector('#news-refresh');
  let loadedAt=0,busy=false,retry=null,active=false;
  async function open(force=false){
    active=true;
    if(busy||(!force&&Date.now()-loadedAt<30*60000))return;
    busy=true;refresh.disabled=true;list.setAttribute('aria-busy','true');status.textContent='Checking the latest JSP announcements…';
    if(retry){clearTimeout(retry);retry=null;}
    try{
      const r=await fetcher('/api/news',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(55000)});
      if(r.status===401){status.textContent='Sign in again to read JSP news.';return;}
      const data=await r.json();
      if(!r.ok)throw Error();
      if(data.pending){status.textContent='Preparing the latest articles…';if(active)retry=setTimeout(()=>open(true),5000);return;}
      const articles=[];
      for(const article of data.articles||[]){const markup=articleMarkup(article,articles.length);if(markup)articles.push(markup);}
      list.innerHTML=articles.length?articles[0]+(articles.length>1?'<div class="news-list-label">More from JSP<span>'+String(articles.length-1)+(articles.length===2?' announcement':' announcements')+'</span></div>'+articles.slice(1).join(''):''):'<div class="news-empty"><strong>You’re all caught up.</strong><p>No JSP announcements are available yet. Check back soon.</p></div>';
      status.textContent=data.stale?'JSP could not be reached. Showing the last available articles.':data.checkedAt?'Last checked '+new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Skopje'}).format(new Date(data.checkedAt))+' · Skopje time':'Official JSP announcements';
      loadedAt=Date.now();
    }catch{status.textContent='JSP news could not be refreshed. Please try again shortly.';}
    finally{busy=false;refresh.disabled=false;list.setAttribute('aria-busy','false');}
  }
  refresh.onclick=()=>open(true);
  return {open,close(){active=false;if(retry){clearTimeout(retry);retry=null;}}};
}
