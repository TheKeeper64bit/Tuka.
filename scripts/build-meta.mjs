import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPages} from './build-pages.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = buildPages({apiBase: 'https://tuka.meta-cerebralvalley.rand0m.net', output: resolve(ROOT, '.build/meta')});
console.log(`Built ${result.assets} Meta hackathon assets at ${result.output}`);
