import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {buildPages,PUBLIC_ASSETS} from '../scripts/build-pages.mjs';

test('Pages publishes only public assets and injects a cookie-free API origin',()=>{
 const temp=mkdtempSync(join(tmpdir(),'tuka-pages-test-'));
 try{
  const source=join(temp,'source'),output=join(temp,'pages');
  for(const file of PUBLIC_ASSETS){const target=join(source,file);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,file==='config.js'?"export const API_BASE = '';\nexport const apiCredentials=()=>API_BASE?'omit':'same-origin';":file);}
  for(const file of ['login.html','session.js','.dev.vars','CNAME','server/index.js']){const target=join(source,file);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,'must stay private');}
  mkdirSync(output,{recursive:true});writeFileSync(join(output,'CNAME'),'old.example');
  buildPages({source,output,apiBase:'https://public-api.example/'});
  assert(existsSync(join(output,'.nojekyll')));assert(existsSync(join(output,'vendor/maplibre-gl.js')));
  for(const file of ['ticket-wallet.js','ticket-wallet.css','ticket-store.js'])assert(existsSync(join(output,file)),`Pages must include the local wallet asset ${file}`);
  for(const file of ['login.html','session.js','.dev.vars','CNAME','server'])assert(!existsSync(join(output,file)),file);
  const config=readFileSync(join(output,'config.js'),'utf8');
  assert(config.includes('export const API_BASE = "https://public-api.example";'));assert(config.includes("API_BASE?'omit':'same-origin'"));
  for(const apiBase of ['',undefined,'http://plain.example','https://user:pass@example.com','https://api.example/api','https://api.example/?key=secret','https://api.example/#key'])assert.throws(()=>buildPages({source,output,apiBase}),/TUKA_API_BASE/);
  assert(existsSync(join(output,'index.html')),'invalid configuration leaves previous build intact');
 }finally{rmSync(temp,{recursive:true,force:true});}
});

test('public HTML and install metadata stay inside the Pages subpath',()=>{
 const root=new URL('https://thekeeper64bit.github.io/Tuka./');
 for(const file of ['index.html','offline.html']){
  const html=readFileSync(new URL('../dist/'+file,import.meta.url),'utf8');
  for(const [,url] of html.matchAll(/(?:src|href)="([^"]+)"/g)){
   if(url.startsWith('#')||/^(?:https?:|mailto:|tel:|intent:)/.test(url))continue;
   assert(new URL(url,root).pathname.startsWith('/Tuka./'),`${file}: ${url}`);
  }
 }
 const manifest=JSON.parse(readFileSync(new URL('../dist/manifest.webmanifest',import.meta.url),'utf8'));
 for(const key of ['start_url','scope','id'])assert.equal(new URL(manifest[key],root).pathname,'/Tuka./');
 for(const icon of manifest.icons)assert(new URL(icon.src,root).pathname.startsWith('/Tuka./'));
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 assert(!html.includes('tuka-signout'));assert(!html.includes('session.js'));assert(!html.includes('Request access'));
});
