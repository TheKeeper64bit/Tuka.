import test from 'node:test';import assert from 'node:assert/strict';
import {translateNotice,validateTranslation} from '../server/notice-translation.js';
import {noticeId} from '../server/notice-id.js';import {articleMarkup} from '../dist/news.js';
import worker from '../server/meta-site.js';
const original={title:'Lijn 5: halte Besterdring vervalt',paragraphs:['Lijn 5 stopt niet bij Besterdring tot 18:00. Gebruik halte Spoorlaan.']};
const translation={title:'Line 5: Besterdring stop closed',paragraphs:['Line 5 does not stop at Besterdring until 18:00. Use the Spoorlaan stop.']};
const id=await noticeId(original.title,original.paragraphs),article={...original,original,originalLanguage:'nl',language:'nl',translationId:id,kind:'operator-notice',publishedAt:null,sourceUrl:'https://www.bravo.info/reizen/omleidingen-en-storingen-bus',summary:original.paragraphs[0]};
const request=()=>new Request('https://local/api/news/translate',{method:'POST',body:JSON.stringify({id})});
const notices=async()=>Response.json({articles:[article]});
const model=value=>Response.json({choices:[{message:{tool_calls:[{function:{name:'translate_notice',arguments:JSON.stringify(value)}}]}}]});
test('English translations preserve numbers, source metadata, Dutch original and are reused',async()=>{
 let calls=0;const memory=new Map(),cache={match:async k=>memory.get(k.url)?.clone(),put:async(k,r)=>memory.set(k.url,r)};
 const fetcher=async(url,init)=>{calls++;assert.match(url,/api.meta.ai/);const payload=JSON.parse(init.body);assert.equal(payload.tool_choice,'auto');assert.equal(payload.tools[0].function.name,'translate_notice');assert.deepEqual(JSON.parse(payload.messages[1].content),original);return model(translation);};
 const options={notices,fetcher,cache};const r=await translateNotice(request(),{MODEL_API_KEY:'test'},options);assert.equal(r.status,200);const data=await r.json();assert.deepEqual(data.translation,translation);assert.equal(data.kind,'machine');
 assert.equal((await translateNotice(request(),{MODEL_API_KEY:'test'},options)).status,200);assert.equal(calls,1);
 const html=articleMarkup({...article,...data.translation,language:'en',machineTranslated:true},0,'tilburg');assert.match(html,/Machine translation/);assert.match(html,/Original Dutch notice/);assert.match(html,/Lijn 5 stopt niet/);assert(!html.includes('data-translate-notice='));
 assert.match(articleMarkup(article,0,'tilburg'),/Read in English/);
});
test('official English is preferred without a model; expired or changed notices are rejected',async()=>{
 const options={notices:async()=>Response.json({articles:[{...article,...translation,language:'en'}]}),fetcher:async()=>{throw Error('Must not call a model');}};
 assert.equal((await translateNotice(request(),{},options)).status,200);
 assert.equal((await translateNotice(request(),{MODEL_API_KEY:'test'},{notices:async()=>Response.json({articles:[]})})).status,404);
});
test('bad translations cannot change line numbers/times or inject extra fields',async()=>{
 for(const value of [{...translation,title:'Line 6: Besterdring stop closed'},{...translation,paragraphs:['Line 5 stops here at 19:00.']},{...translation,sourceUrl:'https://evil.test'}]){
  assert.throws(()=>validateTranslation(value,original));
  const r=await translateNotice(request(),{MODEL_API_KEY:'test'},{notices,fetcher:async()=>model(value)});assert.equal(r.status,502);
 }
 const unavailable=await translateNotice(request(),{},{notices});assert.equal(unavailable.status,503);assert.match((await unavailable.json()).error,/not configured/);
 const failed=await translateNotice(request(),{MODEL_API_KEY:'test'},{notices,fetcher:async()=>new Response('',{status:503})});assert.equal(failed.status,503);
});
test('translation endpoint requires login and rejects oversized or arbitrary text input',async()=>{
 assert.equal((await worker.fetch(request(),{})).status,401);
 assert.equal((await translateNotice(new Request('https://local',{method:'POST',body:JSON.stringify({id,text:'arbitrary'})}),{})).status,400);
 assert.equal((await translateNotice(new Request('https://local',{method:'POST',body:'x'.repeat(1025)}),{})).status,413);
});
