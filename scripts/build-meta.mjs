import {resolve, dirname} from 'node:path';
import {copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildPages} from './build-pages.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = buildPages({apiBase: 'https://tuka.meta-cerebralvalley.rand0m.net', output: resolve(ROOT, '.build/meta')});
for (const file of ['meta.js','meta.css','meta-login','boston-snapshot.json']) copyFileSync(resolve(ROOT, 'dist', file), resolve(result.output, file));
console.log(`Built ${result.assets + 4} Meta hackathon assets at ${result.output}`);
