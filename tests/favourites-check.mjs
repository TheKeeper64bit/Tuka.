import test from 'node:test';
import assert from 'node:assert/strict';
import {readFavourites,writeFavourites,savedSelection,sameSelection,savedRouteMatches} from '../dist/favourites.js';
const storage=value=>({value,getItem(){return this.value;},setItem(key,value){assert.equal(key,'tuka-saved');this.value=value;}});
test('legacy saved stops retain all routes; malformed storage does not break startup',()=>{
  assert.deepEqual(readFavourites(storage('["rekord"]')).get('rekord'),{routeIds:null,targetStopId:null});
  for(const raw of ['broken','null','{}','{"version":2,"stops":[null,{}, {"stopId":"x","routeIds":4}]}'])assert.equal(readFavourites(storage(raw)).size,0);
});
test('Rekord with only bus 5 persists across reload; bus 7 never matches the saved filter',()=>{
  const data=storage('[]'),saved=readFavourites(data);
  saved.set('rekord',savedSelection(new Set(['route-5']),['route-5','route-7'],null));
  writeFavourites(data,saved);const restored=readFavourites(data).get('rekord');
  assert(savedRouteMatches(restored,'route-5'));assert(!savedRouteMatches(restored,'route-7'));
  assert(!savedRouteMatches(restored,'new-route'));assert(sameSelection(restored,{routeIds:['route-5'],targetStopId:null}));
});
test('empty selections stay empty, destinations persist, and explicit all-lines tracks new routes',()=>{
  assert(!savedRouteMatches(savedSelection(new Set(),['r'],null),'r'));
  const withTarget=savedSelection(new Set(['r']),['r'],'airport');assert.deepEqual(withTarget,{routeIds:['r'],targetStopId:'airport'});
  assert(!sameSelection(withTarget,{routeIds:['r'],targetStopId:null}));
  assert(savedRouteMatches(savedSelection(new Set(['r']),['r'],null),'new-route'));
});
