import {resolve, dirname} from 'node:path';
import {CITY_PROVIDERS} from '../dist/city-providers.js';
import {copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildPages} from './build-pages.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = buildPages({apiBase: 'https://tuka.meta-cerebralvalley.rand0m.net', output: resolve(ROOT, '.build/meta')});
for (const file of ['meta.js','meta.css','meta-login','boston-snapshot.json','tilburg-index.json',...Object.values(CITY_PROVIDERS).filter(p=>p.scheduleAsset).map(p=>p.scheduleAsset.slice(2))]) copyFileSync(resolve(ROOT, 'dist', file), resolve(result.output, file));
console.log(`Built ${result.assets + 5 + Object.values(CITY_PROVIDERS).filter(p=>p.scheduleAsset).length} Meta hackathon assets at ${result.output}`);

// The protected Meta build uses its own origin, including local previews.
const config=resolve(result.output,'config.js');writeFileSync(config,readFileSync(config,'utf8').replace(/export const API_BASE = .*?;/,"export const API_BASE = '';"));
const sw=resolve(result.output,'sw.js');writeFileSync(sw,readFileSync(sw,'utf8').replace('const PRIVATE_ACCESS=false;','const PRIVATE_ACCESS=true;'));
