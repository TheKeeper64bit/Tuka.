import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectImage,validateImageFile,walletCardMarkup,WALLET_ERRORS} from '../dist/ticket-wallet.js';

const png=new Blob(['image placeholder'],{type:'image/png'});
test('import accepts bounded raster images and rejects active/vector or oversized files',()=>{
  assert.equal(validateImageFile(png),png);
  for(const type of ['image/svg+xml','text/html','application/pdf',''])assert.throws(()=>validateImageFile(new Blob(['test'],{type})),{code:'invalid-image'});
  assert.throws(()=>validateImageFile(new Blob([],{type:'image/png'})),{code:'invalid-image'});
  assert.throws(()=>validateImageFile(new Blob([new Uint8Array(8*1024*1024+1)],{type:'image/png'})),{code:'image-too-large'});
});

test('image decoding preserves original bytes and releases temporary object URLs on success/failure',async()=>{
  let revoked=[];const urls={createObjectURL:()=> 'blob:test',revokeObjectURL:value=>revoked.push(value)};
  class GoodImage{naturalWidth=300;naturalHeight=500;set src(value){assert.equal(value,'blob:test');queueMicrotask(()=>this.onload());}}
  assert.equal(await inspectImage(png,{ImageClass:GoodImage,urls}),png);assert.deepEqual(revoked,['blob:test']);
  class BadImage{set src(value){queueMicrotask(()=>this.onerror());}}
  await assert.rejects(inspectImage(png,{ImageClass:BadImage,urls}),{code:'image-unreadable'});
  class HugeImage extends GoodImage{naturalWidth=10000;naturalHeight=10000;}
  await assert.rejects(inspectImage(png,{ImageClass:HugeImage,urls}),{code:'image-unreadable'});
  assert.equal(revoked.length,3);
});

test('saved card displays manual counts, safe passenger names and exhausted/undo states',()=>{
  const card={id:'safe-id',name:'<img src=x onerror=bad()>',total:10,remaining:3,canUndo:true};
  let html=walletCardMarkup(card,'blob:local');
  assert(html.includes('&lt;img src=x onerror=bad()&gt;'));assert(!html.includes('<img src=x'));
  assert(html.includes('data-no-translate'));assert(html.includes('<dd>7</dd>'));assert(html.includes('<dd>3</dd>'));assert(html.includes('<dd>10</dd>'));
  assert(html.includes('Manual counter · not synced with SkopjeBus'));assert(html.includes('Undo last use'));
  html=walletCardMarkup({...card,remaining:0,canUndo:false},'blob:local');
  assert(html.includes('data-qr-action="use" disabled'));assert(html.includes('No uses left'));assert(!html.includes('Undo last use'));
  assert(WALLET_ERRORS.conflict.includes('another tab'));assert(WALLET_ERRORS['storage-quota'].includes('no space'));
});
