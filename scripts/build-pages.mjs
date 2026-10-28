import {copyFileSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Deliberate allowlist: a Pages artifact must never include a private login,
// Worker bundle, environment file, or a custom-domain CNAME.
export const PUBLIC_ASSETS=[
  'index.html','offline.html','manifest.webmanifest','sw.js','config.js',
  'app.js','boot.js','layout.js','install.js','language.js','i18n.js',
  'community.js','community-config.json','favourites.js','journey-follow.js',
  'journey-store.js','journey-tools.js','live.js','map-ui.js','news.js',
  'offline.js','place-search.js','planner.js','ride.js','schedule.js',
  'service-alerts.js','stop-network.js','ticket.js','ticket-wallet.js','ticket-store.js','transit.js','walking.js',
  'style.css','boot.css','language.css','news.css','tickets.css','ticket-wallet.css','planner.css','offline.css','meta.css','meta.js',
  'icon.svg','icon-192.png','icon-512.png','icon-192-blue.png','icon-512-blue.png',
  'vendor/maplibre-gl.js','vendor/maplibre-gl.css',
];

export function buildPages({apiBase=process.env.TUKA_API_BASE,source=resolve(ROOT,'dist'),output=resolve(ROOT,'.build/pages')}={}){
  if(!apiBase)throw Error('Set TUKA_API_BASE to the public Tuka API HTTPS origin before building Pages.');
  let api;
  try{api=new URL(apiBase);}catch{throw Error('TUKA_API_BASE must be a valid HTTPS origin.');}
  if(api.protocol!=='https:'||api.username||api.password||api.pathname!=='/'||api.search||api.hash)
    throw Error('TUKA_API_BASE must be an HTTPS origin without a path, credentials, query, or fragment.');
  for(const file of PUBLIC_ASSETS)if(!existsSync(resolve(source,file)))throw Error('Missing public asset: '+file);
  const config=readFileSync(resolve(source,'config.js'),'utf8');
  const declaration=/export const API_BASE\s*=\s*(?:'[^']*'|"[^"]*")\s*;/;
  if(!declaration.test(config))throw Error('Public API configuration marker is missing.');
  // All validation happens before replacing the previous build.
  rmSync(output,{recursive:true,force:true});mkdirSync(output,{recursive:true});
  for(const file of PUBLIC_ASSETS){const target=resolve(output,file);mkdirSync(dirname(target),{recursive:true});copyFileSync(resolve(source,file),target);}
  writeFileSync(resolve(output,'config.js'),config.replace(declaration,()=>`export const API_BASE = ${JSON.stringify(api.origin)};`));
  writeFileSync(resolve(output,'.nojekyll'),'');
  return {output,apiBase:api.origin,assets:PUBLIC_ASSETS.length};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=buildPages();
  console.log(`Built ${result.assets} public assets for GitHub Pages at ${result.output}; API ${result.apiBase}`);
}
