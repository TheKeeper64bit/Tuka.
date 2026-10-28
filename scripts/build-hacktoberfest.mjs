import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPages} from './build-pages.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const result=buildPages({
  apiBase:'https://tuka.hacktoberfest.rand0m.net',
  output:resolve(ROOT,'.build/hacktoberfest'),
});
console.log(`Built ${result.assets} public assets at ${result.output}; API ${result.apiBase}`);
