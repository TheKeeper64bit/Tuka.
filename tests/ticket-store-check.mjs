import test from 'node:test';
import assert from 'node:assert/strict';
import {createTicketStore,TICKET_STORE_LIMITS} from '../dist/ticket-store.js';

// A small asynchronous IDB contract fixture. Transactions get their snapshot
// only after the previous transaction commits, and aborted writes are discarded.
function databaseFixture(){
  const databases=new Map();let writeError=null,openError=null,blocked=false;
  return {
    databases,
    failWrites(name='QuotaExceededError'){writeError=new DOMException('test failure',name);},
    failOpen(name){openError=new DOMException('test failure',name);},
    blockOpen(){blocked=true;},
    indexedDB:{open(name){
      const request={};
      queueMicrotask(()=>{
        if(openError){request.error=openError;request.onerror?.();return;}
        if(blocked){request.onblocked?.();return;}
        const fresh=!databases.has(name);
        if(fresh)databases.set(name,{rows:new Map(),tail:Promise.resolve(),store:false});
        const state=databases.get(name);
        request.result={
          objectStoreNames:{contains:()=>state.store},
          createObjectStore(){state.store=true;},close(){},
          transaction(storeName,mode){
            assert.equal(storeName,'cards');
            let release;const previous=state.tail;state.tail=new Promise(r=>release=r);
            let rows,active=false,ended=false,scheduled=false;
            const requests=[];
            const tx={
              abort(){
                if(ended)throw new DOMException('already completed','InvalidStateError');
                ended=true;queueMicrotask(()=>{tx.onabort?.();release();});
              },
              objectStore(){return {
                get:id=>enqueue(()=>rows.get(id)),getAll:()=>enqueue(()=>[...rows.values()]),count:()=>enqueue(()=>rows.size),
                add:card=>enqueue(()=>{if(rows.has(card.id))throw new DOMException('duplicate','ConstraintError');rows.set(card.id,structuredClone(card));return card.id;},true),
                put:card=>enqueue(()=>{rows.set(card.id,structuredClone(card));return card.id;},true),
                delete:id=>enqueue(()=>{rows.delete(id);},true),
              };},
            };
            function enqueue(action,write=false){const req={};requests.push({action,write,req});schedule();return req;}
            function schedule(){
              if(!active||ended||scheduled)return;scheduled=true;
              queueMicrotask(()=>{
                scheduled=false;if(ended)return;
                const job=requests.shift();
                if(!job){ended=true;if(mode==='readwrite')state.rows=rows;tx.oncomplete?.();release();return;}
                try{
                  if(job.write&&writeError){const error=writeError;writeError=null;throw error;}
                  job.req.result=structuredClone(job.action());job.req.onsuccess?.();
                }catch(error){job.req.error=error;tx.error=error;job.req.onerror?.();tx.onerror?.();if(!ended)tx.abort();}
                schedule();
              });
            }
            previous.then(()=>{rows=structuredClone(state.rows);active=true;schedule();});
            return tx;
          },
        };
        if(fresh)request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }},
  };
}
const png=()=>new Blob([new Uint8Array([137,80,78,71,13,10,26,10,1,2,3,4])],{type:'image/png'});
const input=(overrides={})=>({name:'  City card  ',total:10,remaining:7,image:png(),...overrides});
const expectCode=(promise,code)=>assert.rejects(promise,error=>error?.code===code);
const storeFor=(fixture,scope='/Tuka./')=>createTicketStore({indexedDB:fixture.indexedDB,scope});

test('cards retain original image bytes and counters after reopening, isolated by app path',async()=>{
  const fixture=databaseFixture(),store=storeFor(fixture),image=png();
  const card=await store.add(input({image}));
  assert.equal(card.name,'City card');assert.equal(card.version,1);assert.equal(card.canUndo,false);assert.equal(card.lastUsedAt,null);
  assert(card.createdAt>0);assert.equal(card.updatedAt,card.createdAt);
  store.close();
  await expectCode(store.list(),'closed');
  const reopened=storeFor(fixture),saved=(await reopened.list())[0];
  assert.equal(saved.id,card.id);assert.equal(saved.remaining,7);assert.equal(saved.image.type,'image/png');
  assert.deepEqual(await saved.image.arrayBuffer(),await image.arrayBuffer());
  assert.deepEqual(await storeFor(fixture,'/other-app/').list(),[]);
  assert.equal(fixture.databases.size,2);
});

test('one-step undo restores both the prior count and last-use timestamp, only once',async()=>{
  const fixture=databaseFixture(),store=storeFor(fixture);
  let card=await store.add(input({remaining:2}));
  card=await store.use(card.id,card.version);const firstUse=card.lastUsedAt;
  assert.equal(card.remaining,1);assert(card.canUndo);assert.equal(card.version,2);
  card=await store.use(card.id,card.version);assert.equal(card.remaining,0);
  await expectCode(store.use(card.id,card.version),'exhausted');
  store.close();
  const reopened=storeFor(fixture);card=(await reopened.list())[0];assert(card.canUndo);
  card=await reopened.undo(card.id,card.version);
  assert.equal(card.remaining,1);assert.equal(card.lastUsedAt,firstUse);assert.equal(card.canUndo,false);
  await expectCode(reopened.undo(card.id,card.version),'nothing-to-undo');
  const initial=await reopened.add(input({name:'Fresh',remaining:1}));
  const used=await reopened.use(initial.id,initial.version),undone=await reopened.undo(used.id,used.version);
  assert.equal(undone.remaining,1);assert.equal(undone.lastUsedAt,null);
});

test('simultaneous clicks and stale tabs cannot spend twice or overwrite newer changes',async()=>{
  const fixture=databaseFixture(),first=storeFor(fixture),second=storeFor(fixture);
  const card=await first.add(input({remaining:3}));
  const results=await Promise.allSettled([first.use(card.id,1),second.use(card.id,1)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'conflict');
  assert.equal((await second.list())[0].remaining,2);
  await expectCode(second.update(card.id,{name:'Stale name'},1),'conflict');
  await expectCode(second.remove(card.id,1),'conflict');
  assert.equal((await first.list())[0].name,'City card');
  await expectCode(first.use(card.id,undefined),'invalid-version');
});

test('editing validates the combined values, resets undo, and deletion requires a current version',async()=>{
  const fixture=databaseFixture(),store=storeFor(fixture);
  let card=await store.add(input());card=await store.use(card.id,card.version);
  await expectCode(store.update(card.id,{total:1},card.version),'invalid-remaining');
  assert((await store.list())[0].canUndo,'failed edit leaves undo intact');
  const replacement=new Blob([new Uint8Array([255,216,255,12])],{type:'image/jpeg'});
  card=await store.update(card.id,{name:' Work ',total:12,remaining:9,image:replacement},card.version);
  assert.equal(card.name,'Work');assert.equal(card.total,12);assert.equal(card.remaining,9);assert.equal(card.canUndo,false);
  assert.equal(card.image.type,'image/jpeg');assert(card.lastUsedAt);
  assert.equal((await store.remove(card.id,card.version)).id,card.id);
  assert.deepEqual(await store.list(),[]);
  await expectCode(store.use(card.id,card.version),'not-found');
});

test('bad fields and images never create a card',async()=>{
  const fixture=databaseFixture(),store=storeFor(fixture);
  for(const [patch,code] of [
    [{name:'  '},'invalid-name'],[{name:'x'.repeat(61)},'invalid-name'],
    [{total:0},'invalid-total'],[{total:10000},'invalid-total'],[{total:1.5},'invalid-total'],
    [{remaining:-1},'invalid-remaining'],[{remaining:11},'invalid-remaining'],[{remaining:'3'},'invalid-remaining'],
    [{image:new Blob(['<svg/>'],{type:'image/svg+xml'})},'invalid-image'],
    [{image:new Blob(['pretend PNG'],{type:'image/png'})},'invalid-image'],
    [{image:new Blob([],{type:'image/png'})},'invalid-image'],
    [{image:new Blob([new Uint8Array(TICKET_STORE_LIMITS.imageBytes+1)],{type:'image/png'})},'image-too-large'],
  ])await expectCode(store.add(input(patch)),code);
  assert.deepEqual(await store.list(),[]);
  const card=await store.add(input({total:9999,remaining:9999,name:'x'.repeat(60)}));assert.equal(card.total,9999);
});

test('the ten-card limit is atomic across concurrent tabs',async()=>{
  const fixture=databaseFixture(),first=storeFor(fixture),second=storeFor(fixture);
  for(let i=0;i<9;i++)await first.add(input({name:'Card '+i}));
  const results=await Promise.allSettled([first.add(input()),second.add(input())]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'limit-reached');
  assert.equal((await first.list()).length,10);
});

test('quota and failed writes preserve the old image, count, version and undo metadata',async()=>{
  const fixture=databaseFixture(),store=storeFor(fixture);let card=await store.add(input());
  card=await store.use(card.id,card.version);
  fixture.failWrites();await expectCode(store.use(card.id,card.version),'storage-quota');
  assert.deepEqual(await store.list(),[card]);
  fixture.failWrites('UnknownError');await expectCode(store.remove(card.id,card.version),'storage-error');
  assert.deepEqual(await store.list(),[card]);
  const undone=await store.undo(card.id,card.version);assert.equal(undone.remaining,7);
});

test('unavailable, denied and blocked storage return actionable errors',async()=>{
  await expectCode(createTicketStore({indexedDB:null}).list(),'storage-unavailable');
  const denied=databaseFixture();denied.failOpen('SecurityError');await expectCode(storeFor(denied).list(),'storage-unavailable');
  const blocked=databaseFixture();blocked.blockOpen();await expectCode(storeFor(blocked).list(),'storage-blocked');
});
