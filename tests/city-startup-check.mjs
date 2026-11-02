import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {locateCity} from '../dist/city-providers.js';
import {load} from '../dist/transit.js';
test('GPS selects each supported city without downloading a default network',async()=>{
 for(const [id,latitude,longitude] of [['skopje',42,21.43],['boston',42.36,-71.06],['tilburg',51.56,5.08]]){
  const r=await locateCity({getCurrentPosition(ok,fail,options){assert.equal(options.timeout,8000);ok({coords:{latitude,longitude}});}});assert.equal(r.city.id,id);
 }
 const denied=await locateCity({getCurrentPosition(ok,fail){fail();}});assert.equal(denied.city,null);assert.equal(denied.reason,'unavailable');
 assert.equal((await locateCity(null)).city,null);
 const outside=await locateCity({getCurrentPosition(ok){ok({coords:{latitude:0,longitude:0}});}});assert.equal(outside.city,null);assert.equal(outside.reason,'located');
});
test('switching back and concurrent loads reuse the normalized city timetable',async()=>{
 const previous=globalThis.fetch;let downloads=0;
 globalThis.fetch=async url=>{downloads++;assert.match(url,/boston-network.bin/);return new Response(fs.readFileSync(new URL('../dist/boston-network.bin',import.meta.url)));};
 try{const [a,b]=await Promise.all([load({cityId:'boston'}),load({cityId:'boston'})]);assert.equal(a,b);assert.equal(await load({cityId:'boston'}),a);assert.equal(downloads,1);assert.equal(a.provider,'boston');}finally{globalThis.fetch=previous;}
});
