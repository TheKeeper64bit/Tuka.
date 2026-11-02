import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretJourney} from '../server/meta-intent.js';
const env={MODEL_API_KEY:'test-meta',BASETEN_API_KEY:'test-baseten',BASETEN_MODEL:'account-tool-model'};
const intent={origin:null,destination:'Tilburg Centraal',mode:'now',date:null,time:null,maxWalkingMinutes:10,preference:'fastest'};
const answer=value=>Response.json({choices:[{message:{tool_calls:[{function:{name:'plan_transit_journey',arguments:JSON.stringify(value)}}]}}]});
const request=body=>new Request('https://local/api/meta/interpret',{method:'POST',body:JSON.stringify(body??{cityId:'tilburg',message:'Take me to Tilburg Centraal'})});
test('Meta succeeds without spending Baseten credits',async()=>{
 let count=0;const r=await interpretJourney(request(),env,{fetcher:async(url,options)=>{count++;assert.match(url,/api.meta.ai/);assert.equal(options.headers.Authorization,'Bearer test-meta');return answer(intent);}});
 assert.equal(r.status,200);assert.equal((await r.json()).provider,'meta');assert.equal(count,1);
});
test('transient Meta failures fall back once with isolated Baseten credentials and identical tools',async()=>{
 for(const failure of [401,403,408,429,500,502,503,504,'network']){
  const calls=[];const r=await interpretJourney(request(),env,{fetcher:async(url,options)=>{calls.push({url,...options,body:JSON.parse(options.body)});if(calls.length===1){if(failure==='network')throw Error('private upstream details');return new Response('',{status:failure});}return answer(intent);}});
  assert.equal(r.status,200);assert.equal((await r.json()).provider,'baseten');assert.equal(calls.length,2);
  assert.equal(calls[1].url,'https://inference.baseten.co/v1/chat/completions');assert.equal(calls[1].headers.Authorization,'Bearer test-baseten');assert.equal(calls[1].body.model,'account-tool-model');assert.deepEqual(calls[0].body.tools,calls[1].body.tools);assert.equal(calls[1].redirect,'error');
 }
});
test('Baseten-only configuration works; a key without explicit model stays disabled',async()=>{
 const config={BASETEN_API_KEY:env.BASETEN_API_KEY,BASETEN_MODEL:env.BASETEN_MODEL};
 assert.equal((await interpretJourney(request(),config,{fetcher:async()=>answer(intent)})).status,200);
 assert.equal((await interpretJourney(request(),{BASETEN_API_KEY:'test'})).status,503);
});
test('invalid model itineraries and bad requests never bypass validation or retry',async()=>{
 for(const value of [{...intent,tripId:'invented'},{...intent,maxWalkingMinutes:999}]){
 let count=0;const r=await interpretJourney(request(),env,{fetcher:async()=>{count++;return answer(value);}});assert.equal(r.status,422);assert.equal(count,1);
 }
 assert.equal((await interpretJourney(new Request('https://local',{method:'POST',body:'null'}),env)).status,400);
 let count=0;const r=await interpretJourney(request(),env,{fetcher:async()=>{count++;return new Response('',{status:400});}});assert.equal(r.status,502);assert.equal(count,1);
});
test('exhausted providers expose no upstream error details',async()=>{
 let count=0;const r=await interpretJourney(request(),env,{fetcher:async()=>{count++;throw Error('credential or internal endpoint');}});assert.equal(count,2);assert.equal(r.status,502);assert.doesNotMatch(await r.text(),/credential|internal endpoint/);
});
