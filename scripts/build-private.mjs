import {cpSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');

export function buildPrivate({source=resolve(ROOT,'dist'),privateSource=resolve(ROOT,'private'),output=resolve(ROOT,'.build/private')}={}){
  output=resolve(output);
  rmSync(output,{recursive:true,force:true});mkdirSync(output,{recursive:true});
  for(const entry of readdirSync(source,{withFileTypes:true})){
    if(entry.name.startsWith('.')||['server','CNAME'].includes(entry.name))continue;
    cpSync(resolve(source,entry.name),resolve(output,entry.name),{recursive:true});
  }
  for(const file of ['login.html','login.js','login.css','session.js'])cpSync(resolve(privateSource,file),resolve(output,file));
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
  return {output};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=buildPrivate();
  console.log('Built protected Cloudflare assets in '+result.output);
}
