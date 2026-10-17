import {cpSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const output=resolve('.build/private');
rmSync(output,{recursive:true,force:true});mkdirSync(output,{recursive:true});
for(const entry of readdirSync('dist',{withFileTypes:true})){
  if(entry.name.startsWith('.')||['server','CNAME'].includes(entry.name))continue;
  cpSync(resolve('dist',entry.name),resolve(output,entry.name),{recursive:true});
}
for(const file of ['login.html','login.js','login.css','session.js'])cpSync(resolve('private',file),resolve(output,file));
const index=resolve(output,'index.html');
let html=readFileSync(index,'utf8');
if(!html.includes('id="theme"'))throw Error('Private build needs the header theme control');
html=html.replace(/(<button\b[^>]*id="theme"[^>]*>.*?<\/button>)/,'$1<button id="tuka-signout" class="iconbtn" aria-label="Sign out of this browser" title="Sign out">↪</button>');
html=html.replace('</body>','<script defer src="session.js"></script></body>');
writeFileSync(index,html);
const worker=resolve(output,'sw.js');
let serviceWorker=readFileSync(worker,'utf8');
if(serviceWorker.includes('const PRIVATE_ACCESS=false;'))serviceWorker=serviceWorker.replace('const PRIVATE_ACCESS=false;','const PRIVATE_ACCESS=true;');
else serviceWorker=serviceWorker.replace('async function prepare(){',"async function prepare(){\n  const session=await fetch('/auth/session',{cache:'no-store',credentials:'same-origin'});\n  if(!session.ok||!(await session.json()).authenticated)return;");
writeFileSync(worker,serviceWorker);
console.log('Built protected Cloudflare assets in .build/private');
