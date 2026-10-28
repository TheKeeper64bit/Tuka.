import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
function harness({stores=new Map(),label='',base='/',privateAccess=false,authenticated=true,sessionStatus=200}={}){
 const listeners={};let online=true,onlineStatus=200,brokenAsset=false,brokenWrite=false,pausedWrite=null;
 const requests=[];
 const clients=new Set();
 const caches={async keys(){return [...stores.keys()];},async delete(k){return stores.delete(k);},async open(k){if(!stores.has(k))stores.set(k,new Map());const rows=stores.get(k);return {async put(url,r){if(pausedWrite&&url===base+'offline.js')await pausedWrite;if(brokenWrite&&url===base+'planner.js?v=24')throw Error('quota exceeded');rows.set(String(url),r.clone());},async match(url){return rows.get(String(url))?.clone();}};}};
 const fetch=async req=>{if(!online)throw Error('network offline');const path=typeof req==='string'?req:new URL(req.url).pathname;requests.push(path);if(path===base+'auth/session'){if(!privateAccess)throw Error('Public app must not request a session');return new Response(JSON.stringify({authenticated}),{status:sessionStatus});}if(path===base+'api/tickets')return new Response('private');if(onlineStatus!==200)return new Response('Unavailable',{status:onlineStatus});if(brokenAsset&&path===base+(brokenAsset===true?'offline.js':brokenAsset))return new Response('missing',{status:404});return new Response(label+(path===base+'offline.html'?'offline reader':path));};
 const source=fs.readFileSync('dist/sw.js','utf8').replace('const PRIVATE_ACCESS=false;',`const PRIVATE_ACCESS=${privateAccess};`);
 vm.runInNewContext(source,{self:{location:{origin:'https://tuka.test'},registration:{scope:'https://tuka.test'+base},addEventListener:(key,fn)=>listeners[key]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{},matchAll:async()=>[...clients].map(id=>({id}))}},caches,fetch,URL,Promise,Error});
 const lifecycle=async type=>{let work;listeners[type]({waitUntil:p=>work=p});await work;};
 return {stores,requests,setOnline:v=>online=v,setStatus:v=>onlineStatus=v,breakAsset:(v=true)=>brokenAsset=v,breakWrite:(v=true)=>brokenWrite=v,pauseWrite:promise=>pausedWrite=promise,activate:()=>lifecycle('activate'),async prepare(){let work;listeners.message({data:{type:'PREPARE_OFFLINE'},waitUntil:p=>work=p});await work;},async request(path,mode='navigate',clientId='reader'){let answer;if(clientId)clients.add(clientId);listeners.fetch({clientId:mode==='navigate'?'':clientId,resultingClientId:mode==='navigate'?clientId:'',request:{url:'https://tuka.test'+path,method:'GET',mode},respondWith:p=>answer=p});return answer;}};
}
function previousReader(){
 return new Map([
  ['tuka-v10',new Map([['/',new Response('old private shell')]])],
  ['tuka-offline-v24',new Map([
   ['/offline.html',new Response('previous offline reader')],
   ['/offline.js',new Response('previous module')],
   ['/planner.js?v=23',new Response('previous planner')],
   ['/api/tickets',new Response('must not serve')],
  ])],
 ]);
}
test('public offline reader prepares without any session check; APIs and unknown routes are never cached',async()=>{
 const h=harness();await h.prepare();assert(!h.requests.some(path=>path.startsWith('/auth/')));h.setOnline(false);
 assert.equal(await (await h.request('/')).text(),'offline reader');assert.equal(await (await h.request('/planner.js?v=24','cors')).text(),'/planner.js?v=24');
 await assert.rejects(h.request('/api/tickets','cors'));await assert.rejects(h.request('/auth/session','cors'));await assert.rejects(h.request('/app.js?v=24','cors'));await assert.rejects(h.request('/login'));
});
test('online error responses are not replaced by cached content',async()=>{
 const h=harness();await h.prepare();h.setStatus(503);assert.equal((await h.request('/')).status,503);assert.equal((await h.request('/planner.js?v=24','cors')).status,503);
});
test('incomplete installation cannot create a working offline reader',async()=>{
 const h=harness();h.breakAsset();await h.prepare();assert.equal(h.stores.size,0);h.setOnline(false);await assert.rejects(h.request('/'));
});
test('offline wallet assets are available at both deployment paths and missing assets cannot publish a partial reader',async()=>{
 const assets=['ticket-wallet.js?v=1','ticket-wallet.css?v=1','ticket-store.js?v=1'];
 for(const base of ['/','/Tuka./']){
  const h=harness({base});await h.prepare();h.setOnline(false);
  for(const asset of assets)assert.equal(await (await h.request(base+asset,'cors')).text(),base+asset);
 }
 for(const asset of assets){
  const h=harness({stores:previousReader()});h.breakAsset(asset);await h.prepare();h.setOnline(false);
  assert.equal(await (await h.request('/')).text(),'previous offline reader');
  assert.equal([...h.stores.keys()].filter(key=>key.startsWith('tuka-offline-')).length,1);
 }
});
test('the public app has no sign-out control or session script and old session scripts are inert',()=>{
 const html=fs.readFileSync('dist/index.html','utf8');
 assert(!html.includes('tuka-signout'));assert(!html.includes('src="session.js"'));
 // An older tab can still request this asset during the rollout. It must not
 // contact removed authentication endpoints, clear saved data, or redirect.
 vm.runInNewContext(fs.readFileSync('dist/session.js','utf8'),{});
});

test('worker activation retains the old public reader while a replacement is unavailable',async()=>{
 const h=harness({stores:previousReader()});await h.activate();
 assert(!h.stores.has('tuka-v10'));assert(h.stores.has('tuka-offline-v24'));
 h.setOnline(false);
 assert.equal(await (await h.request('/')).text(),'previous offline reader');
 assert.equal(await (await h.request('/planner.js?v=23','cors')).text(),'previous planner');
 await assert.rejects(h.request('/api/tickets','cors'));
 h.setOnline(true);h.breakAsset();await h.prepare();h.setOnline(false);
 assert.equal(await (await h.request('/')).text(),'previous offline reader');
});
test('failed cache writes do not corrupt the previous reader or publish a partial generation',async()=>{
 const h=harness({stores:previousReader()});h.breakWrite();await h.prepare();h.setOnline(false);
 assert.equal(await (await h.request('/')).text(),'previous offline reader');
 assert.equal(await (await h.request('/offline.js','cors')).text(),'previous module');
 assert.equal([...h.stores.keys()].filter(k=>k.startsWith('tuka-offline-')).length,1);
});
test('offline upgrade publishes all assets together and preserves dependencies of the old open reader',async()=>{
 const h=harness({stores:previousReader(),label:'new '});await h.activate();h.setOnline(false);
 assert.equal(await (await h.request('/','navigate','old-tab')).text(),'previous offline reader');
 h.setOnline(true);
 let release;h.pauseWrite(new Promise(resolve=>release=resolve));
 const preparation=h.prepare();
 // Fetching and putting are asynchronous: wait for the staging cache to exist.
 for(let i=0;i<30&&!([...h.stores.keys()].some(k=>k.startsWith('tuka-offline-v32-')));i++)await new Promise(resolve=>setImmediate(resolve));
 assert([...h.stores.keys()].some(k=>k.startsWith('tuka-offline-v32-')));
 h.setOnline(false);
 assert.equal(await (await h.request('/','navigate','during-update')).text(),'previous offline reader');
 release();await preparation;
 assert.equal(await (await h.request('/','navigate','new-tab')).text(),'new offline reader');
 assert.equal(await (await h.request('/offline.js','cors','new-tab')).text(),'new /offline.js');
 assert.equal(await (await h.request('/offline.js','cors','old-tab')).text(),'previous module');
 assert.equal(await (await h.request('/planner.js?v=23','cors','old-tab')).text(),'previous planner');
});
test('Pages offline reader stays within its repository path and retains other applications caches',async()=>{
 const stores=previousReader(),h=harness({stores,base:'/Tuka./'});await h.activate();await h.prepare();
 assert(h.requests.every(path=>path.startsWith('/Tuka./')));
 assert(h.requests.includes('/Tuka./config.js?v=1'));
 assert(stores.has('tuka-v10'));assert(stores.has('tuka-offline-v24'));
 assert([...stores.keys()].some(key=>key.startsWith('tuka-offline-%2FTuka.%2F-v32-')));
 h.setOnline(false);
 assert.equal(await (await h.request('/Tuka./')).text(),'offline reader');
 assert.equal(await (await h.request('/Tuka./index.html')).text(),'offline reader');
 assert.equal(await (await h.request('/Tuka./planner.js?v=24','cors')).text(),'/Tuka./planner.js?v=24');
 assert.equal(await h.request('/'),undefined);assert.equal(await h.request('/other/'),undefined);
 await assert.rejects(h.request('/Tuka./api/tickets','cors'));
 await assert.rejects(h.request('/Tuka./login'));
});
test('private build mode checks the session before caching an offline reader',async()=>{
 for(const sessionStatus of [200,401]){
  const denied=harness({privateAccess:true,authenticated:false,sessionStatus});await denied.prepare();
  assert.deepEqual(denied.requests,['/auth/session']);assert.equal(denied.stores.size,0);
 }
 const allowed=harness({privateAccess:true});await allowed.prepare();allowed.setOnline(false);
 assert.equal(allowed.requests[0],'/auth/session');assert.equal(await (await allowed.request('/')).text(),'offline reader');
});
