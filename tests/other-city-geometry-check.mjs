import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {normalizeGTFS} from '../dist/gtfs.js';import {routeGeometry,trimGeometry} from '../dist/map-ui.js';
for(const city of ['boston','tilburg'])test(city+' loop patterns use published geometry and retain downstream trimming',()=>{
 const c=JSON.parse(gunzipSync(fs.readFileSync(new URL('../dist/'+city+'-network.bin',import.meta.url)))),db=normalizeGTFS(c.tables,city,c),report=JSON.parse(fs.readFileSync(new URL('../reports/'+city+'-route-audit.json',import.meta.url)));
 assert.equal(report.recovered.length,city==='boston'?11:3);
 for(const row of report.recovered){const trip=db.trips.get(row.trip),g=routeGeometry(db,trip);assert(!g.approximate,row.route);const stops=db.times.get(trip.trip_id).map(s=>db.stopIndex.get(s.stop_id)).map(s=>[s.lon,s.lat]);assert(trimGeometry(g.points,stops,Math.floor(stops.length/2)).length>=2,row.trip);}
 for(const row of report.invalid)assert(routeGeometry(db,db.trips.get(row.trip)).approximate);
});
