import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../server/public-site.js';

const origin='https://tuka.hacktoberfest.rand0m.net';
function setup({assets,api}={}){
  const calls=[];
  const handler=(kind,reply)=>async request=>{
    calls.push({kind,request});
    return reply?reply(request):new Response(kind==='asset'?'public app':'public API',{
      headers:{'Content-Type':kind==='asset'?'text/html':'application/json'},
    });
  };
  const env={
    PUBLIC_DEMO_ENABLED:'true',
    ASSETS:{fetch:handler('asset',assets)},
    PUBLIC_API:{fetch:handler('api',api)},
  };
  return {calls,request:(path,options={})=>worker.fetch(new Request(origin+path,options),env)};
}

test('the disabled demo blocks pages, cached-reader URLs, assets and APIs without calling any binding',async()=>{
  const forbidden={fetch:()=>assert.fail('The disabled demo must not reach assets or APIs')};
  for(const flag of [undefined,'false','',true]){
    const env={PUBLIC_DEMO_ENABLED:flag,ASSETS:forbidden,PUBLIC_API:forbidden};
    for(const path of ['/','/index.html','/offline.html','/app.js','/sw.js','/api/live','/api/news']){
      for(const method of ['GET','HEAD','POST']){
        const response=await worker.fetch(new Request(origin+path,{method}),env);
        assert.equal(response.status,410,path);
        assert.equal(response.headers.get('Cache-Control'),'no-store');
        assert.equal(response.headers.get('Set-Cookie'),null);
        if(method==='HEAD')assert.equal(await response.text(),'');
        else assert.match(await response.text(),/public Tuka demo is closed/);
      }
    }
  }
});

test('public root serves the index without an access gate and preserves shared-link queries',async()=>{
  const s=setup();
  const response=await s.request('/?stop=1513&fromName=Rekord');
  assert.equal(response.status,200);
  assert.equal(await response.text(),'public app');
  assert.equal(response.headers.get('Location'),null);
  assert.equal(s.calls.length,1);
  assert.equal(s.calls[0].kind,'asset');
  assert.equal(s.calls[0].request.url,origin+'/index.html?stop=1513&fromName=Rekord');
  assert.equal(s.calls[0].request.method,'GET');

  await s.request('/app.js?v=32');
  assert.equal(s.calls[1].kind,'asset');
  assert.equal(s.calls[1].request.url,origin+'/app.js?v=32');
});

test('public API requests retain their URL and query but never forward browser credentials or Origin',async()=>{
  const s=setup();
  const path='/api/arrivals?stop=52';
  const response=await s.request(path,{headers:{
    Cookie:'private-session=test-secret',Authorization:'Bearer test-secret',
    Origin:origin,Accept:'text/html','X-Client-Secret':'test-secret',
  }});
  assert.equal(response.status,200);
  assert.equal(await response.text(),'public API');
  assert.equal(s.calls.length,1);
  const {kind,request}=s.calls[0];
  assert.equal(kind,'api');
  assert.equal(request.url,origin+path);
  assert.equal(request.method,'GET');
  assert.deepEqual([...request.headers],[['accept','application/json']]);
});

test('public API responses preserve data and status while removing session and cross-origin headers',async()=>{
  const s=setup({api:()=>new Response('{"available":false}',{status:503,headers:{
    'Content-Type':'application/json','Retry-After':'30',
    'Set-Cookie':'private-session=test-secret',
    'Access-Control-Allow-Credentials':'true',
    'Access-Control-Allow-Origin':'https://thekeeper64bit.github.io',
  }})});
  const response=await s.request('/api/live');
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{available:false});
  assert.equal(response.headers.get('Content-Type'),'application/json');
  assert.equal(response.headers.get('Retry-After'),'30');
  for(const header of ['Set-Cookie','Access-Control-Allow-Credentials','Access-Control-Allow-Origin']){
    assert.equal(response.headers.get(header),null,header);
  }
});

test('HEAD requests reach the appropriate binding without returning a response body',async()=>{
  const s=setup();
  for(const [path,kind] of [['/','asset'],['/style.css?v=32','asset'],['/api/tickets','api']]){
    const response=await s.request(path,{method:'HEAD'});
    assert.equal(response.status,200,path);
    assert.equal(await response.text(),'',path);
    assert.equal(s.calls.at(-1).kind,kind);
    assert.equal(s.calls.at(-1).request.method,'HEAD');
  }
});

test('write methods and preflight are rejected before any asset or API binding is invoked',async()=>{
  const s=setup();
  for(const path of ['/','/app.js','/api/news','/auth/request']){
    for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']){
      const response=await s.request(path,{method});
      assert.equal(response.status,405,method+' '+path);
      assert.match(response.headers.get('Allow')||'',/GET/);
      assert.match(response.headers.get('Allow')||'',/HEAD/);
    }
  }
  assert.equal(s.calls.length,0);
});

test('private auth paths and unknown assets keep asset 404s instead of receiving the app shell',async()=>{
  const s=setup({assets:()=>new Response('Not found',{status:404})});
  for(const path of ['/auth/session','/auth/request','/login','/login.html','/missing.js']){
    const response=await s.request(path);
    assert.equal(response.status,404,path);
    assert.equal(await response.text(),'Not found',path);
    assert.equal(s.calls.at(-1).kind,'asset');
    assert.equal(s.calls.at(-1).request.url,origin+path);
  }
  assert.equal(s.calls.length,5);
});

test('binding failures return a generic 503 without exposing exception details or credentials',async()=>{
  const fail=()=>{throw new Error('backend-secret-token and private-session=test-secret');};
  const s=setup({assets:fail,api:fail});
  for(const path of ['/','/api/news']){
    const response=await s.request(path,{headers:{Cookie:'private-session=test-secret'}});
    assert.equal(response.status,503,path);
    const body=await response.text();
    assert(body.length>0);
    assert(!/backend-secret-token|test-secret|Error:|at .*\.js/.test(body));
    assert.equal(response.headers.get('Set-Cookie'),null);
  }
  const head=await s.request('/api/news',{method:'HEAD'});
  assert.equal(head.status,503);
  assert.equal(await head.text(),'');
});

test('the public custom domain uses isolated assets and a read API binding while the original site keeps its private Worker',()=>{
  const config=JSON.parse(readFileSync(new URL('../wrangler.hacktoberfest.jsonc',import.meta.url),'utf8'));
  const privateConfig=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
  assert.equal(config.main,'server/public-site.js');
  assert.equal(config.assets.directory,'./.build/hacktoberfest');
  assert.equal(config.assets.binding,'ASSETS');
  assert.equal(config.assets.run_worker_first,true);
  assert.equal(config.assets.html_handling,'none');
  assert.equal(config.assets.not_found_handling,'none');
  assert.deepEqual(config.services,[{binding:'PUBLIC_API',service:'tuka-public-api'}]);
  assert.equal(config.routes.length,1);
  assert.equal(config.routes[0].pattern,'tuka.hacktoberfest.rand0m.net');
  assert.equal(config.routes[0].custom_domain,true);
  assert.equal(config.workers_dev,false);
  assert.equal(config.preview_urls,false);
  assert.equal(config.vars.PUBLIC_DEMO_ENABLED,'false');
  assert.equal(config.d1_databases,undefined);
  assert.equal(config.send_email,undefined);
  assert.equal(privateConfig.main,'server/cloudflare.js');
  assert.equal(privateConfig.assets.directory,'./.build/private');
  assert(privateConfig.routes.some(route=>route.pattern==='tuka.rand0m.net'));
});
