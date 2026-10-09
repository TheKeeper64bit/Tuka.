import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {routeGeometry} from '../dist/map-ui.js';
import {boardingNetwork} from '../dist/stop-network.js';
import {createProgress} from '../dist/ride.js';

// Actual feed data: outbound 47a П detours into Bulgaria; return is valid.
const fixture=JSON.parse(readFileSync(new URL('./fixtures/47a-geometry.json',import.meta.url),'utf8'));
const db={stops:fixture.stops,routes:new Map([[fixture.route.route_id,fixture.route]]),trips:new Map(fixture.trips.map(t=>[t.trip_id,t])),times:new Map(Object.entries(fixture.times)),shapes:new Map(Object.entries(fixture.shapes)),byStop:new Map()};
for(const times of db.times.values())for(const s of times){if(!db.byStop.has(s.stop_id))db.byStop.set(s.stop_id,[]);db.byStop.get(s.stop_id).push(s);}
const [outbound,inbound]=fixture.trips;
const out=routeGeometry(db,outbound),back=routeGeometry(db,inbound);
assert(out.approximate);assert.equal(out.reason,'invalid-shape');assert.equal(out.points.length,23);
assert(out.points.every(([lon,lat])=>lon>21.3&&lon<21.6&&lat>41.9&&lat<42.2));
assert.equal(back.approximate,false);assert.equal(back.points.length,289);
assert.equal(outbound.trip_headsign,'ЉУБОТЕН');
const boarding='2575',network=boardingNetwork(db,boarding),pattern=network.patterns.find(p=>p.trip.shape_id==='24440');
assert(pattern.approximate);
const stops=pattern.downstream.map(p=>({...db.stops.find(s=>s.id===p.stop_id),...p}));
assert.deepEqual(pattern.points[0],[stops[0].lon,stops[0].lat]);
assert.deepEqual(pattern.points.at(-1),[stops.at(-1).lon,stops.at(-1).lat]);
const progress=createProgress(pattern.points,stops,stops.length-1);
assert(progress.cumulative.at(-1)<15000,'Ride distances must not include the foreign excursion');

// A bad coordinate must not silently create a new straight road between neighbours.
const small={stops:[{id:'a',lon:21.4,lat:42},{id:'b',lon:21.41,lat:42}],times:new Map([['t',[{stop_id:'a'},{stop_id:'b'}]]]),shapes:new Map()};
const trip={trip_id:'t',shape_id:'shape'};
for(const point of [[NaN,42],[21.4,91],[181,42],[25.96,43.85]]){
  small.shapes.set('shape',[[21.4,42],point,[21.41,42]]);assert(routeGeometry(small,trip).approximate);
}
// Modest local road detours are valid; excessive loops within the bounding box are not.
small.shapes.set('shape',[[21.4,42],[21.402,42.003],[21.41,42]]);assert(!routeGeometry(small,trip).approximate);
small.shapes.set('shape',Array.from({length:80},(_,i)=>i%2?[21.41,42]:[21.4,42]));assert(routeGeometry(small,trip).approximate);
assert.deepEqual(routeGeometry(db,outbound,['2575','2590']).points,[out.points[14],out.points.at(-1)]);
console.log('Passed: authentic 47a П corrupt shape rejected, valid return preserved, downstream/Ride geometry bounded, invalid coordinates and excessive loops rejected');
