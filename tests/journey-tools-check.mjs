import test from 'node:test';
import assert from 'node:assert/strict';
import {place,readShared,sharedJourney,readPlaces,writePlace,wheelchairAccess} from '../dist/journey-tools.js';
import {matchingAlerts,alertText,safeLink,decodeAlert} from '../dist/service-alerts.js';
import {journeyStatus,journeyVehicles} from '../dist/journey-follow.js';
import {translateText} from '../dist/i18n.js';
const origin={lat:42,lon:21.4,name:'<Home & family>'},destination={lat:42.01,lon:21.42,name:'Work'};
test('shared journeys round-trip places and preferences, never carry live times',()=>{
 const link=sharedJourney('https://tuka.test',origin,destination,{mode:'arrive',walkingSpeed:3,minTransfer:5,preference:'walking'});
 const shared=readShared(link);assert.deepEqual(shared.origin,origin);assert.deepEqual(shared.destination,destination);assert.equal(shared.options.mode,'now');assert.equal(shared.options.walkingSpeed,3);assert.equal(shared.options.preference,'walking');assert.equal(shared.options.minTransfer,5);
 for(const value of ['NaN,21.4','42,Infinity','0,0',',21.4','42,21.4,0'])assert.equal(readShared('https://tuka.test/?from='+value+'&to=42,21.4'),null);
 assert.equal(readShared('https://tuka.test/?stop=1513').stop,'1513');
});
test('Home and Work stay on this device and invalid stored points are ignored',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 writePlace(storage,'home',origin);writePlace(storage,'work',destination);assert.deepEqual(readPlaces(storage),{home:origin,work:destination});
 map.set('tuka-places','{"home":{"lat":999,"lon":2}}');assert.equal(readPlaces(storage).home,null);
});
test('suburban JSP stops can be saved and shared on either side of the city',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 const stops=[
  {lat:41.9884033203125,lon:21.65216064453125,name:'ОУ МИЛАДИНОВЦИ-КОН ЦЕНТАР'},
  {lat:41.959228515625,lon:21.781400680541992,name:'СУШИЦА Т'},
  {lat:41.98222732543945,lon:21.192293167114258,name:'ПАТ ЗА БОЈАНЕ-КОН ЦЕНТАР'},
 ];
 for(const stop of stops){
  assert.deepEqual(writePlace(storage,'home',stop).home,stop);
  const shared=readShared(sharedJourney('https://tuka.test',origin,stop));
  assert.equal(shared.destination.name,stop.name);
  assert(Math.abs(shared.destination.lon-stop.lon)<0.00001);
 }
});
test('invalid saved-place updates fail without erasing existing Home and Work',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 writePlace(storage,'home',origin);writePlace(storage,'work',destination);
 const before=map.get('tuka-places');
 for(const invalid of [null,{lat:null,lon:21.4},{lat:' ',lon:21.4},{lat:[42],lon:21.4},{lat:42,lon:999}]){
  assert.equal(place(invalid),null);assert.throws(()=>writePlace(storage,'home',invalid),RangeError);
  assert.equal(map.get('tuka-places'),before);
  assert.equal(sharedJourney('https://tuka.test',origin,invalid),null);
 }
 assert.throws(()=>writePlace(storage,'other',origin),RangeError);
 assert.equal(map.get('tuka-places'),before);
});
const stopA={id:'a',wheelchair_boarding:'1'},stopB={id:'b',wheelchair_boarding:'1'},route={route_id:'r',agency_id:'jsp',route_type:'3'};
const now=Date.parse('2026-10-17T10:00:00Z'),leg={type:'bus',tripId:'t',serviceDate:'20261017',route,from:stopA,to:stopB,boardSeq:1,endSeq:2,start:now+120000,end:now+600000};
const db={stops:[stopA,stopB],trips:new Map([['t',{wheelchair_accessible:'1',direction_id:'0'}]]),times:new Map([['t',[{stop_id:'a',seq:1},{stop_id:'b',seq:2}]]])};
test('wheelchair labels require bus and both stops, with unknown and explicit negatives preserved',()=>{
 assert.equal(wheelchairAccess(db,[leg]),'yes');assert.equal(wheelchairAccess(db,[]),'unknown');
 assert.equal(wheelchairAccess(db,[{...leg,to:{id:'c'}}]),'unknown');assert.equal(wheelchairAccess(db,[{...leg,to:{id:'c',wheelchair_boarding:'2'}}]),'no');
});
test('official alerts match all selector fields, service date and affected period, and expire with the feed',()=>{
 const base={periods:[],selectors:[{route:'r',direction:0,date:'20261017'}],title:[{language:'mk',text:'Промена'},{language:'en',text:'Change'}]};
 const rt={alertTimestamp:now/1000,alerts:[base,{...base,selectors:[{route:'r',direction:1}]},{...base,selectors:[{route:'r',date:'20261018'}]},{...base,periods:[{end:now/1000-60}]},{...base,selectors:[{route:'r',stop:'elsewhere'}]}]};
 assert.equal(matchingAlerts(db,rt,[leg],now).length,1);assert.equal(matchingAlerts(db,rt,[leg],now+121000).length,0);
 assert.equal(alertText(base.title,'mk'),'Промена');assert.equal(safeLink('javascript:alert(1)'),null);
 const objects=new Map([['a',{3:['range'],5:['selector'],10:['title']}],['range',{1:[10],2:[20]}],['selector',{2:[new TextEncoder().encode('r')],6:[0]}],['title',{1:['translation']}],['translation',{1:[new TextEncoder().encode('Works')],2:[new TextEncoder().encode('en')]}]]);
 const decoded=decodeAlert('a',x=>objects.get(x));assert.equal(decoded.periods[0].start,10);assert.equal(decoded.selectors[0].direction,0);assert.equal(alertText(decoded.title),'Works');
});
test('selected journey drops stale live labels and flags a street walk that misses the bus',()=>{
 const result={departure:now,arrival:leg.end,legs:[{type:'walk',start:now,end:now+60000,walkingMs:180000},leg]};
 const status=journeyStatus(db,null,result,now);assert(status.disrupted);assert.equal(status.legs[1].live,false);
 const vehicles={vehicles:[{tripId:'t',date:'20261017',lat:42,lon:21.4,timestamp:now/1000},{tripId:'t',date:'20261018',lat:42,lon:21.4,timestamp:now/1000},{tripId:'t',date:'20261017',lat:42,lon:21.4,timestamp:now/1000-121}]};
 assert.equal(journeyVehicles(vehicles,result,now).length,1);
});
test('language labels keep proper names and use complete translated warning phrases',()=>{
 assert.equal(translateText('Find journeys','en'),'Find journeys');assert.equal(translateText('Search origin','mk'),'Пребарај почетна точка');assert.equal(translateText('Least walking','sq'),'Më pak ecje');
 assert.equal(translateText('No matching alerts in the available live feed.','mk'),'Нема соодветни известувања во достапните податоци во живо.');assert.equal(translateText('РЕКОРД · 5','sq'),'РЕКОРД · 5');
});
