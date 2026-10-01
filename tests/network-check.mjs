import assert from 'node:assert/strict';
import {boardingNetwork,visibleNetwork,connection,vehicleServes,arrivalConnects} from '../dist/stop-network.js';
const stops=['before','rekord','east','far','west','restricted'].map((id,i)=>({id,lat:42,lon:21.4+i*.002}));
const routes=new Map(['5','7','23P'].map(id=>[id,{route_id:id,route_short_name:id}]));
const trips=new Map(),times=new Map(),byStop=new Map();
function trip(id,rid,path,options={}){trips.set(id,{trip_id:id,route_id:rid,trip_headsign:options.headsign||rid,shape_id:id});const t=path.map((id,i)=>({stop_id:id,trip_id:options.id||id,seq:i+1,seconds:100+i*60,...options[id]}));t.forEach(x=>x.trip_id=id);times.set(id,t);for(const s of t){if(!byStop.has(s.stop_id))byStop.set(s.stop_id,[]);byStop.get(s.stop_id).push(s);}}
trip('five','5',['before','rekord','east','far']);trip('fiveLater','5',['before','rekord','east','far']);trip('seven','7',['rekord','east']);trip('reverse','5',['west','east','rekord','before']);trip('private','23P',['rekord','restricted','far'],{restricted:{drop_off_type:'1'}});trip('noBoard','7',['rekord','west'],{rekord:{pickup_type:'1'}});
const db={stops,routes,trips,times,byStop,shapes:new Map()};const n=boardingNetwork(db,'rekord');assert.deepEqual([...n.routes.keys()].sort(),['23P','5','7']);assert.equal(n.patterns.length,4);assert(!n.reachable.has('west'));assert(!n.reachable.has('restricted'));assert(n.reachable.has('before'));assert.equal(n.patterns.find(p=>p.trip.trip_id==='five').points[0][0],stops[1].lon);
assert(connection(db,'five','rekord','far'));assert(!connection(db,'reverse','rekord','east'));assert(!connection(db,'noBoard','rekord','west'));assert(!connection(db,'private','rekord','restricted'));
const v={tripId:'five',seq:1,lat:42,lon:21.4,timestamp:Date.now()/1000};assert(vehicleServes(db,v,'rekord','far'));assert(!vehicleServes(db,{...v,seq:3},'rekord','far'));assert(!vehicleServes(db,{...v,tripId:'reverse'},'rekord','east'));assert(!vehicleServes(db,{...v,timestamp:v.timestamp-121},'rekord','far'));
const sk={...v,tripId:null,stops:[{id:'rekord',seq:2},{id:'east',seq:3}]};assert(vehicleServes(db,sk,'rekord','east'));assert(!vehicleServes(db,sk,'rekord','far'));
assert(arrivalConnects(db,{trip:trips.get('five'),s:{seq:2}},'rekord','far'));assert(!arrivalConnects(db,{trip:trips.get('reverse'),s:{seq:3}},'rekord','east'));
assert(arrivalConnects(db,{unmatched:true,path:['rekord','east']},'rekord','east'));assert(!arrivalConnects(db,{unmatched:true,path:['east','rekord']},'rekord','east'));
const visible=visibleNetwork(n,new Set(['5','7','23P']),'east');assert.deepEqual([...new Set(visible.patterns.map(p=>p.route.route_id))].sort(),['5','7']);
console.log('Passed: all boarding routes, directional downstream reach, repeated trips deduplication, boarding/alighting restrictions, live progress, exact destination connections');
