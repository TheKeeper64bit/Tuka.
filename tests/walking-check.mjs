import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {walkingResponse,normalizeWalk} from '../server/walking.js';
const from={lon:21.431,lat:41.996},to={lon:21.435,lat:41.998};
const data={code:'Ok',routes:[{distance:410,geometry:{coordinates:[[from.lon,from.lat],[to.lon,to.lat]]},legs:[{steps:[{name:'Macedonia Square',mode:'walking',distance:410,maneuver:{type:'depart'}}]}]}]};
function database(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('migrations/0004_walking.sql','utf8'));return {prepare(query){let args=[];return {bind(...a){args=a;return this;},async first(){return sql.prepare(query).get(...args);},async run(){return sql.prepare(query).run(...args);}};},async batch(rows){for(const row of rows)await row.run();}};}
const request=(end='21.435,41.998')=>new Request('https://tuka.test/api/walk?from=21.431,41.996&to='+end);
test('pedestrian directions reject car routes, remote snapped points and malformed paths',()=>{
 assert.equal(normalizeWalk(data,from,to).distance,410);
 const copy=structuredClone(data);copy.routes[0].legs[0].steps[0].mode='driving';assert.throws(()=>normalizeWalk(copy,from,to));
 assert.throws(()=>normalizeWalk(data,{lat:42.1,lon:21.5},to));
 copy.routes[0].geometry.coordinates[0]=[NaN,42];assert.throws(()=>normalizeWalk(copy,from,to));
});
test('walking API caches results, has a shared rate budget and never forwards credentials',async()=>{
 const env={AUTH_DB:database()};let calls=0;const fetcher=async(url,options)=>{calls++;assert(url.startsWith('https://routing.openstreetmap.de/routed-foot/route/v1/foot/'));assert.equal(options.headers.Cookie,undefined);assert(options.headers['User-Agent'].startsWith('Tuka/'));return Response.json(data);};
 assert.equal((await walkingResponse(request(),env,{fetcher,now:1000})).status,200);
 assert.equal((await walkingResponse(request(),env,{fetcher,now:1001})).status,200);assert.equal(calls,1);
 assert.equal((await walkingResponse(request('21.43501,41.998'),env,{fetcher,now:1001})).status,429);assert.equal(calls,1);
 assert.equal((await walkingResponse(request('100,100'),env,{fetcher,now:10000})).status,400);assert.equal(calls,1);
 assert.equal((await walkingResponse(request('21.43501,41.998'),env,{fetcher:async()=>{throw Error();},now:5000})).status,503);
});
