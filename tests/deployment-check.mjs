import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {buildPrivate} from '../scripts/build-private.mjs';

test('private artifact adds access controls without changing the public source',()=>{
  const temp=mkdtempSync(join(tmpdir(),'tuka-private-test-'));
  try{
    const {output}=buildPrivate({output:join(temp,'private')});
    const privateHTML=readFileSync(join(output,'index.html'),'utf8'),publicHTML=readFileSync('dist/index.html','utf8');
    assert(privateHTML.includes('id="tuka-signout"'));assert(privateHTML.includes('src="session.js"'));
    assert(!publicHTML.includes('id="tuka-signout"'));assert(!publicHTML.includes('src="session.js"'));
    const worker=readFileSync(join(output,'sw.js'),'utf8');
    assert(worker.includes('const PRIVATE_ACCESS=true;')||worker.includes("const session=await fetch('/auth/session'"));
    assert(existsSync(join(output,'login.html')));assert(!existsSync(join(output,'.dev.vars')));
    assert(readFileSync(join(output,'session.js'),'utf8').includes("location.replace('/login')"));
    assert(readFileSync(join(output,'login.html'),'utf8').includes('language.js'));
  }finally{rmSync(temp,{recursive:true,force:true});}
});

test('private sign-in preserves shared links without external redirects',()=>{
  const source=readFileSync('private/login.js','utf8');
  const start=source.indexOf('function returnPath()'),end=source.indexOf('\nasync function api(',start);
  const run=search=>vm.runInNewContext(source.slice(start,end)+'; returnPath()',{URLSearchParams,location:{search}});
  for(const path of ['/?stop=1513','/?from=42,21.4&to=42.01,21.42'])assert.equal(run('?next='+encodeURIComponent(path)),path);
  for(const path of ['https://example.com','//example.com','/login','/?x=\nHeader'])assert.equal(run('?next='+encodeURIComponent(path)),'/');
});
