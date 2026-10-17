import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {parseFeed,mergeArticles,newsResponse,JSP_FEED} from '../server/news.js';
import {articleMarkup,createNewsView} from '../dist/news.js';
const item=(title='Bus 5 diversion',url='https://skopjebus.mk/en/bus-5/')=>`<item><title>${title}</title><link>${url}</link><pubDate>Fri, 09 Oct 2026 11:03:27 +0000</pubDate><content:encoded><![CDATA[<p>Bus 5 uses Stop A &amp; Stop B.</p><p>From 10 October at 08:00.</p>]]></content:encoded></item>`;
const feed='<rss><channel>'+item()+'</channel></rss>';
const generated={articles:[{sourceId:0,summary:'Bus 5 changes its stops.',paragraphs:['Bus 5 uses Stop A & Stop B from 10 October at 08:00.']}]};
function setup(){
  const sqlite=new DatabaseSync(':memory:');for(const file of ['0002_news.sql','0003_news_budget.sql'])sqlite.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const db={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};}};
  return {sqlite,env:{AUTH_DB:db,GEMINI_API_KEY:'test-only'},req:new Request('https://tuka.rand0m.net/api/news')};
}
test('JSP parser keeps official source/date/content, rejects hostile URLs, and deduplicates',()=>{
  const sources=parseFeed('<rss>'+item()+item()+item('Bad','https://evil.example/x')+item('Credentials','https://a:b@skopjebus.mk/x')+'</rss>');
  assert.equal(sources.length,1);assert.equal(sources[0].publishedAt,'2026-10-09T11:03:27.000Z');assert.match(sources[0].content,/Stop A & Stop B/);
  assert.throws(()=>parseFeed('<html>Error</html>'));assert.throws(()=>parseFeed('<rss></rss>'));
});
test('model output cannot replace source URLs, dates or titles, duplicate sources or omit articles',()=>{
  const sources=parseFeed(feed),out=mergeArticles(sources,generated);
  assert.equal(out[0].sourceUrl,sources[0].sourceUrl);assert.equal(out[0].publishedAt,sources[0].publishedAt);assert(out[0].aiEdited);
  assert.throws(()=>mergeArticles(sources,{articles:[]}));assert.throws(()=>mergeArticles(sources,{articles:[{...generated.articles[0],sourceId:5}]}));
  assert.throws(()=>mergeArticles([...sources,...sources],{articles:[generated.articles[0],generated.articles[0]]}));
});
test('cache avoids duplicate paid calls and unchanged feed never regenerates',async()=>{
  const s=setup();let fetches=0,generations=0;
  const fetcher=async url=>{assert.equal(url,JSP_FEED);fetches++;return new Response(feed);};
  const generate=async sources=>{generations++;return mergeArticles(sources,generated);};
  const first=await newsResponse(s.req,s.env,{fetcher,generate,now:1000000});assert.equal(first.status,200);
  await newsResponse(s.req,s.env,{fetcher,generate,now:1000001});assert.equal(fetches,1);assert.equal(generations,1);
  await newsResponse(s.req,s.env,{fetcher,generate,now:3000000});assert.equal(fetches,2);assert.equal(generations,1);
});
test('concurrent requests acquire one lease; provider failure shows original text and retries later',async()=>{
  const s=setup();let release,started;const ready=new Promise(r=>started=r);let calls=0;
  const generate=async()=>{calls++;started();await new Promise(r=>release=r);throw Error('provider unavailable');};
  const pending=newsResponse(s.req,s.env,{fetcher:async()=>new Response(feed),generate,now:1000000});await ready;
  const second=await newsResponse(s.req,s.env,{generate,now:1000001});assert.equal(second.status,202);
  release();const payload=await (await pending).json();assert.equal(calls,1);assert.equal(payload.articles[0].aiEdited,false);assert.match(payload.articles[0].paragraphs[1],/08:00/);
  assert.equal(s.sqlite.prepare('SELECT refresh_token FROM jsp_news_cache').get().refresh_token,null);
});
test('source outages retain dated cached articles; arbitrary input cannot trigger writes or upstream fetches',async()=>{
  const s=setup();await newsResponse(s.req,s.env,{fetcher:async()=>new Response(feed),generate:async sources=>mergeArticles(sources,generated),now:1000000});
  const outage=await newsResponse(s.req,s.env,{fetcher:async()=>{throw Error();},now:3000000});const payload=await outage.json();assert(payload.stale);assert.equal(payload.articles.length,1);assert.equal(payload.checkedAt,new Date(1000000).toISOString());
  const result=await newsResponse(new Request(s.req,{method:'POST',body:'{"url":"https://evil.example"}'}),s.env);assert.equal(result.status,405);
});
test('new notices appear immediately as originals during the two-hour AI gap; failed calls consume quota',async()=>{
  const s=setup();let calls=0;
  const generate=async sources=>{calls++;return mergeArticles(sources,generated);};
  await newsResponse(s.req,s.env,{fetcher:async()=>new Response(feed),generate,now:100000000});
  const changed=feed.replace('Bus 5 diversion','Bus 5 update');
  const next=await newsResponse(s.req,s.env,{fetcher:async()=>new Response(changed),generate,now:102000000});
  assert.equal((await next.json()).articles[0].title,'Bus 5 update');assert.equal(calls,1);
  await newsResponse(s.req,s.env,{fetcher:async()=>new Response(changed),generate:async()=>{calls++;throw Error();},now:108000000});
  assert.equal(calls,2);assert.equal(s.sqlite.prepare('SELECT ai_attempts FROM jsp_news_cache').get().ai_attempts,2);
  s.sqlite.prepare('UPDATE jsp_news_cache SET ai_next_at=0, retry_after=0, ai_attempts=12').run();
  await newsResponse(s.req,s.env,{fetcher:async()=>new Response(changed),generate:()=>assert.fail('daily budget must hold'),now:110000000});
});
test('missing key shows official originals; oversized feeds fail without generation',async()=>{
  const s=setup();delete s.env.GEMINI_API_KEY;
  const result=await newsResponse(s.req,s.env,{fetcher:async()=>new Response(feed),generate:()=>assert.fail('No key must not call Gemini'),now:1000000});assert.equal((await result.json()).articles[0].aiEdited,false);
  const other=setup();const large=await newsResponse(other.req,other.env,{fetcher:async()=>new Response('x'.repeat(512001)),generate:()=>assert.fail(),now:1000000});assert.equal(large.status,503);
});
test('article UI escapes source and model text and never renders an external source URL',()=>{
  const article=mergeArticles(parseFeed(feed),generated)[0];article.title='<img src=x onerror=alert(1)>';article.paragraphs=['<script>evil()</script>'];
  const html=articleMarkup(article,0);assert(!html.includes('<script>'));assert(!html.includes('<img'));assert(html.includes('&lt;script&gt;'));assert(html.includes('noopener noreferrer'));
  assert.equal(articleMarkup({...article,sourceUrl:'javascript:alert(1)'},0),'');
});
test('news fetch is lazy, refresh restores controls after errors, and old content remains visible',async()=>{
  const els=new Map(['#news-list','#news-status','#news-refresh'].map(id=>[id,{innerHTML:'existing article',setAttribute(){}}]));let calls=0;
  const view=createNewsView({querySelector:s=>els.get(s)},async()=>{calls++;throw Error();});assert.equal(calls,0);await view.open();assert.equal(els.get('#news-refresh').disabled,false);assert.equal(els.get('#news-list').innerHTML,'existing article');assert.match(els.get('#news-status').textContent,/could not be refreshed/);
});
