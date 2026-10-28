// Always try the network first. Retain only the public offline transit reader;
// API responses and unknown routes are never cached.
// The private deployment build enables this; GitHub Pages stays public.
const PRIVATE_ACCESS=false;
const BASE_PATH=new URL('./',self.registration.scope).pathname;
const CACHE_PREFIX=BASE_PATH==='/'?'tuka-offline-':'tuka-offline-'+encodeURIComponent(BASE_PATH)+'-';
const OFFLINE_CACHE=CACHE_PREFIX+'v32';
const ownReaderCache=key=>BASE_PATH==='/'?/^tuka-offline-v\d+(?:-|$)/.test(key):key.startsWith(CACHE_PREFIX);
const FILES=['offline.html','offline.js','offline.css','ticket-wallet.js?v=1','ticket-wallet.css?v=1','ticket-store.js?v=1','config.js?v=1','transit.js?v=24','schedule.js?v=24','planner.js?v=24','journey-store.js?v=24','favourites.js?v=20','live.js?v=16','language.js?v=31','language.css?v=31','i18n.js?v=32','service-alerts.js?v=26'].map(path=>BASE_PATH+path);
const PUBLIC_FILES=new Set(FILES.map(path=>path.split('?')[0]));
const readerClients=new Map();
let preparing,generation=0;
async function readyCaches(){
  const keys=(await caches.keys()).filter(ownReaderCache).reverse();
  const current=key=>key===OFFLINE_CACHE||key.startsWith(OFFLINE_CACHE+'-');
  keys.sort((a,b)=>Number(current(b))-Number(current(a)));
  const ready=[];
  for(const key of keys){const cache=await caches.open(key);if(await cache.match(BASE_PATH+'offline.html'))ready.push({key,cache});}
  return ready;
}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  // Keep the previous complete reader until this worker has prepared its own.
  if(BASE_PATH==='/')await Promise.all((await caches.keys()).filter(key=>/^tuka-v/.test(key)).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
async function prepare(){
  if(PRIVATE_ACCESS){
    const session=await fetch(BASE_PATH+'auth/session',{cache:'no-store',credentials:'same-origin'});
    if(!session.ok||session.redirected||(await session.json())?.authenticated!==true)throw Error('An active session is required');
  }
  const responses=await Promise.all(FILES.map(async path=>{
    const response=await fetch(path,{cache:'no-store'});
    if(!response.ok||response.redirected)throw Error('Offline asset unavailable');
    return [path,response];
  }));
  // A new generation also protects an existing reader from failed cache writes.
  const key=OFFLINE_CACHE+'-'+Date.now()+'-'+(++generation),cache=await caches.open(key);
  try{
    for(const [path,response] of responses.slice(1))await cache.put(path,response);
    // The document is the readiness marker; publish it only after all modules.
    await cache.put(responses[0][0],responses[0][1]);
  }catch(error){await caches.delete(key);throw error;}
  const ready=await readyCaches(),keep=new Set([key,ready.find(entry=>entry.key!==key)?.key]);
  // A document served by the old reader must retain its matching dependencies.
  const clients=await self.clients.matchAll?.()||[];
  for(const client of clients){const pinned=readerClients.get(client.id);if(pinned)keep.add(pinned);}
  await Promise.all((await caches.keys()).filter(name=>ownReaderCache(name)&&!keep.has(name)).map(name=>caches.delete(name)));
}
self.addEventListener('message',event=>{
  if(event.data?.type==='PREPARE_OFFLINE')event.waitUntil(preparing??=(prepare().catch(()=>{}).finally(()=>{preparing=null;})));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(BASE_PATH)||event.request.method!=='GET')return;
  event.respondWith((async()=>{
    try{return await fetch(event.request,{cache:'no-store'});}
    catch(error){
      const navigation=event.request.mode==='navigate'&&['','index.html','offline.html'].some(path=>url.pathname===BASE_PATH+path);
      const fallback=navigation?BASE_PATH+'offline.html':PUBLIC_FILES.has(url.pathname)?url.pathname+url.search:null;
      if(!fallback)throw error;
      const ready=await readyCaches(),pinned=readerClients.get(event.clientId);
      if(!navigation&&pinned)ready.sort((a,b)=>(b.key===pinned)-(a.key===pinned));
      for(const {key,cache} of ready){
        const response=await cache.match(fallback);
        if(response){if(navigation&&event.resultingClientId)readerClients.set(event.resultingClientId,key);return response;}
      }
      throw error;
    }
  })());
});
