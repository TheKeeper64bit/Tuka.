import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';

test('private artifact adds access controls without changing the public source',()=>{
  execFileSync(process.execPath,['scripts/build-private.mjs']);
  const privateHTML=readFileSync('.build/private/index.html','utf8'),publicHTML=readFileSync('dist/index.html','utf8');
  assert(privateHTML.includes('id="tuka-signout"'));assert(privateHTML.includes('src="session.js"'));
  assert(!publicHTML.includes('id="tuka-signout"'));assert(!publicHTML.includes('src="session.js"'));
  const worker=readFileSync('.build/private/sw.js','utf8');
  assert(worker.includes('const PRIVATE_ACCESS=true;')||worker.includes("const session=await fetch('/auth/session'"));
  assert(existsSync('.build/private/login.html'));assert(!existsSync('.build/private/.dev.vars'));
  assert(readFileSync('.build/private/session.js','utf8').includes("location.replace('/login')"));
  assert(readFileSync('.build/private/login.html','utf8').includes('language.js'));
});

test('private sign-in preserves shared links without external redirects',()=>{
  const source=readFileSync('private/login.js','utf8');
  const start=source.indexOf('function returnPath()'),end=source.indexOf('\nasync function api(',start);
  const run=search=>vm.runInNewContext(source.slice(start,end)+'; returnPath()',{URLSearchParams,location:{search}});
  for(const path of ['/?stop=1513','/?from=42,21.4&to=42.01,21.42'])assert.equal(run('?next='+encodeURIComponent(path)),path);
  for(const path of ['https://example.com','//example.com','/login','/?x=\nHeader'])assert.equal(run('?next='+encodeURIComponent(path)),'/');
});
