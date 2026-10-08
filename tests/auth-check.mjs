import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {accessResponse} from '../server/auth.js';
import worker from '../server/cloudflare.js';
const origin = 'https://tuka.rand0m.net';
function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_access.sql', import.meta.url),'utf8'));
  const db = {
    prepare(sql) {
      let args = [];
      return {bind(...values) { args = values; return this; }, first() { return Promise.resolve(sqlite.prepare(sql).get(...args) || null); }, run() { const r = sqlite.prepare(sql).run(...args); return Promise.resolve({meta:{changes:Number(r.changes)}}); }};
    },
    async batch(statements) { sqlite.exec('BEGIN'); try { const results = []; for(const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results; } catch(e) {sqlite.exec('ROLLBACK'); throw e;} },
  };
  const messages = [];
  const env = {AUTH_DB:db, AUTH_SECRET:'test-only-secret-with-more-than-32-characters', OWNER_ADDRESS:'ignatij.tasevski@gmail.com', SENDER_ADDRESS:'access@rand0m.net', PUBLIC_ORIGIN:origin, ASSETS:{fetch:async () => new Response('protected asset')}};
  env.OWNER_EMAIL = {send: async message => {messages.push(message);}};
  const req = (path, input, cookies='', extra={}) => new Request(origin + path, {method:input === undefined ? 'GET':'POST', headers:{...(input !== undefined ? {'Content-Type':'application/json', Origin:origin}:{}), Cookie:cookies, 'CF-Connecting-IP':'192.0.2.1', ...extra}, body:input === undefined ? undefined:JSON.stringify(input)});
  const call = (path, input, cookies='', extra={}) => accessResponse(req(path,input,cookies,extra),env,env.OWNER_EMAIL.send);
  return {sqlite,env,messages,req,call};
}
const cookie = (response, name) => response.headers.getSetCookie().find(x => x.startsWith(name+'='))?.split(';')[0];
async function requested(s, label='Test browser') {
  const response = await s.call('/auth/request',{label, email:'attacker@example.com', to:'attacker@example.com'});
  assert.equal(response.status,200);
  const body = await response.json();
  const code = s.messages.at(-1).text.match(/One-time code: (\d{8})/)[1];
  assert.ok(!JSON.stringify(body).includes(code));
  return {requestCookie:cookie(response,'__Host-tuka_request'), code, body};
}
async function approved(s) {
  const r = await requested(s);
  const response = await s.call('/auth/verify',{code:r.code},r.requestCookie);
  assert.equal(response.status,200);
  return {...r,response,sessionCookie:cookie(response,'__Host-tuka_session')};
}
test('unauthenticated documents, scripts and APIs stay protected; missing configuration fails closed',async()=>{
  const s=setup();
  for(const path of ['/','/index.html']) assert.equal((await worker.fetch(s.req(path),s.env)).status,303);
  for(const path of ['/api/live','/app.js','/vendor/maplibre-gl.js','/server/index.js','/community.js','/community-config.json','/ticket.js']) assert.equal((await worker.fetch(s.req(path),s.env)).status,401);
  assert.equal((await worker.fetch(s.req('/login'),s.env)).status,200);
  assert.equal((await worker.fetch(s.req('/api/live'),{...s.env,AUTH_SECRET:''})).status,503);
});
test('production HTTP upgrades to HTTPS before serving login or accepting a code',async()=>{
  const s=setup();
  const response=await worker.fetch(new Request('http://tuka.rand0m.net/login?from=home'),s.env);
  assert.equal(response.status,308);
  assert.equal(response.headers.get('Location'),'https://tuka.rand0m.net/login?from=home');
  const post=await worker.fetch(new Request('http://tuka.rand0m.net/auth/request',{method:'POST',body:'{}'}),s.env);
  assert.equal(post.status,308);
  assert.equal(s.messages.length,0);
  assert.equal((await worker.fetch(s.req('/login'),s.env)).headers.get('Strict-Transport-Security'),'max-age=31536000');
});
test('codes go only to the owner, are not returned or stored in plaintext, and escape visitor labels',async()=>{
  const s=setup(),r=await requested(s,'<img src=x onerror=alert(1)>');
  assert.equal(s.messages[0].to,'ignatij.tasevski@gmail.com');
  assert.ok(!s.messages[0].html.includes('<img'));
  assert.ok(s.messages[0].html.includes('&lt;img'));
  const row=s.sqlite.prepare('SELECT * FROM challenges').get();
  assert.ok(!JSON.stringify(row).includes(r.code));
  assert.match(r.requestCookie,/^__Host-tuka_request=[a-f0-9]{64}$/);
});
test('a code approves only its requesting browser and grants a persistent secure session',async()=>{
  const s=setup(),r=await requested(s);
  assert.equal((await s.call('/auth/verify',{code:r.code},'__Host-tuka_request='+'a'.repeat(64))).status,401);
  const result=await s.call('/auth/verify',{code:r.code},r.requestCookie);
  const header=result.headers.getSetCookie().find(x=>x.startsWith('__Host-tuka_session='));
  for(const flag of ['Secure','HttpOnly','SameSite=Strict','Path=/','Max-Age=15552000']) assert.ok(header.includes(flag));
  const sessionCookie=cookie(result,'__Host-tuka_session');
  assert.equal(await s.call('/app.js',undefined,sessionCookie),null);
  assert.equal((await (await s.call('/auth/session',undefined,sessionCookie)).json()).authenticated,true);
  assert.ok(!JSON.stringify(s.sqlite.prepare('SELECT * FROM sessions').get()).includes(sessionCookie.split('=')[1]));
});
test('simultaneous redemption and subsequent replay can create only one session',async()=>{
  const s=setup(),r=await requested(s);
  const results=await Promise.all([s.call('/auth/verify',{code:r.code},r.requestCookie),s.call('/auth/verify',{code:r.code},r.requestCookie)]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,401]);
  assert.equal(s.sqlite.prepare('SELECT count(*) AS n FROM sessions').get().n,1);
  assert.equal((await s.call('/auth/verify',{code:r.code},r.requestCookie)).status,401);
});
test('five incorrect attempts lock the code; expired codes cannot approve a browser',async()=>{
  const s=setup(),r=await requested(s),bad=r.code==='00000000'?'11111111':'00000000';
  for(let i=0;i<5;i++) assert.equal((await s.call('/auth/verify',{code:bad},r.requestCookie)).status,401);
  assert.equal((await s.call('/auth/verify',{code:r.code},r.requestCookie)).status,401);
  assert.equal((await s.call('/auth/request',{label:'Again'},r.requestCookie)).status,429);
  const e=setup(),expired=await requested(e);
  e.sqlite.prepare('UPDATE challenges SET expires_at = 1').run();
  assert.equal((await e.call('/auth/verify',{code:expired.code},expired.requestCookie)).status,401);
});
test('pending browser requests do not resend; per-IP limits prevent inbox flooding',async()=>{
  const s=setup(),r=await requested(s);
  assert.equal((await s.call('/auth/request',{label:'Again'},r.requestCookie)).status,200);
  assert.equal(s.messages.length,1);
  for(let i=0;i<4;i++) await requested(s,'Other browser '+i);
  assert.equal((await s.call('/auth/request',{label:'Too many'})).status,429);
  assert.equal(s.messages.length,5);
});
test('cross-origin requests cannot send mail, redeem codes or log a browser out',async()=>{
  const s=setup();
  assert.equal((await s.call('/auth/request',{label:'Bad'},'',{Origin:'https://example.com'})).status,403);
  assert.equal(s.messages.length,0);
  const r=await approved(s);
  assert.equal((await s.call('/auth/logout',{},r.sessionCookie,{Origin:'https://example.com'})).status,403);
  assert.equal(await s.call('/app.js',undefined,r.sessionCookie),null);
});
test('logout and owner revocation invalidate a remembered browser at the server',async()=>{
  const s=setup(),r=await approved(s);
  const logout=await s.call('/auth/logout',{},r.sessionCookie);
  assert.ok(logout.headers.getSetCookie().some(x=>x.startsWith('__Host-tuka_session=;')&&x.includes('Max-Age=0')));
  assert.equal((await s.call('/app.js',undefined,r.sessionCookie)).status,401);
  const revoked=await approved(s);
  s.sqlite.prepare('DELETE FROM sessions').run();
  assert.equal((await s.call('/api/live',undefined,revoked.sessionCookie)).status,401);
});
test('expired or forged session cookies are rejected',async()=>{
  const s=setup(),r=await approved(s);
  s.sqlite.prepare('UPDATE sessions SET expires_at = 1').run();
  assert.equal((await s.call('/app.js',undefined,r.sessionCookie)).status,401);
  assert.equal((await s.call('/app.js',undefined,'__Host-tuka_session='+'f'.repeat(64))).status,401);
});
test('delivery failure leaves no usable challenge; oversized and invalid requests are rejected',async()=>{
  const s=setup(); s.env.OWNER_EMAIL.send=async()=>{throw new Error('Mail failure');};
  assert.equal((await s.call('/auth/request',{label:'Test'})).status,503);
  assert.equal(s.sqlite.prepare('SELECT count(*) AS n FROM challenges').get().n,0);
  assert.equal((await s.call('/auth/request',{label:'x'.repeat(1100)})).status,400);
  assert.equal((await s.call('/auth/request',{label:'Bad\nlabel'})).status,400);
});
