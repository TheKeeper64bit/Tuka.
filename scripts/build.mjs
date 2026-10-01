import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {join,extname} from 'node:path';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const assets={};
function walk(dir,prefix=''){for(const x of readdirSync(dir,{withFileTypes:true})){if(x.name==='server'||x.name.startsWith('.'))continue;const rel=prefix+'/'+x.name,path=join(dir,x.name);if(x.isDirectory())walk(path,rel);else assets[rel]={type:types[extname(x.name)]||'application/octet-stream',body:readFileSync(path).toString('base64')};}}
walk('dist');mkdirSync('dist/server',{recursive:true});
writeFileSync('dist/server/index.js','const STATIC='+JSON.stringify(assets)+';\n'+readFileSync('server/worker.js','utf8'));
mkdirSync('dist/.openai',{recursive:true});writeFileSync('dist/.openai/hosting.json',readFileSync('.openai/hosting.json'));
console.log('Built transport worker and '+Object.keys(assets).length+' existing app assets');
