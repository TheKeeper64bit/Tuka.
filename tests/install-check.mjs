import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import worker from '../server/meta-site.js';
const source=fs.readFileSync('dist/install.js','utf8');
function ui(userAgent,{standalone=false,touch=0}={}){
 const elements=new Map(['install-app','install-dialog','install-confirm','install-help','install-close'].map(id=>[id,{hidden:false,showModal(){this.open=true;},close(){this.open=false;}}])),events=new Map();
 vm.runInNewContext(source,{document:{querySelector:s=>elements.get(s.slice(1))},window:{matchMedia:()=>({matches:standalone,addEventListener(){}}),addEventListener:(k,f)=>events.set(k,f)},navigator:{userAgent,maxTouchPoints:touch}});
 return {elements,events};
}
test('install guidance covers Android, iPhone, iPadOS and desktop',()=>{
 for(const [ua,touch,expected] of [['Android Chrome',0,/Chrome or Edge/],['iPhone Safari',0,/Add to Home Screen/],['Macintosh Safari',5,/Add to Home Screen/],['Macintosh Safari',0,/Add to Dock/],['Windows Chrome',0,/address bar/]]){
 const h=ui(ua,{touch});h.elements.get('install-app').onclick();assert(h.elements.get('install-dialog').open);assert.match(h.elements.get('install-help').textContent,expected);assert(h.elements.get('install-confirm').hidden);
 }
 assert(ui('Chrome',{standalone:true}).elements.get('install-app').hidden);
});
test('native prompt is only invoked after the rider clicks Install; installed mode hides the control',async()=>{
 const h=ui('Android Chrome');let prevented=false,prompts=0;h.events.get('beforeinstallprompt')({preventDefault(){prevented=true;},async prompt(){prompts++;},userChoice:Promise.resolve({outcome:'accepted'})});
 assert(prevented);assert.equal(prompts,0);assert(!h.elements.get('install-confirm').hidden);await h.elements.get('install-confirm').onclick();assert.equal(prompts,1);h.events.get('appinstalled')();assert(h.elements.get('install-app').hidden);
});
test('install metadata is readable without a session; transit data and app code remain protected',async()=>{
 const env={ASSETS:{fetch:async request=>new Response(fs.readFileSync('dist'+new URL(request.url).pathname))}};
 const manifest=await worker.fetch(new Request('https://local/manifest.webmanifest'),env);assert.equal(manifest.status,200);assert.match(manifest.headers.get('Content-Type'),/application\/manifest\+json/);const data=await manifest.json();assert.equal(data.name,'Tuka');assert.equal(data.display,'standalone');assert(!JSON.stringify(data).includes('Skopje'));
 for(const icon of data.icons){const response=await worker.fetch(new Request(new URL(icon.src,'https://local/')),env);assert.equal(response.status,200);const bytes=new Uint8Array(await response.arrayBuffer());assert.equal(new DataView(bytes.buffer).getUint32(16),parseInt(icon.sizes));}
 assert.equal((await worker.fetch(new Request('https://local/api/cities'),env)).status,401);
 assert.equal((await worker.fetch(new Request('https://local/app.js'),env)).status,303);
 assert.equal((await worker.fetch(new Request('https://local/manifest.webmanifest',{method:'POST'}),env)).status,405);
});
