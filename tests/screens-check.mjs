import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const html=fs.readFileSync('dist/index.html','utf8');const ids=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));const elements=new Map();function el(){const classes=new Set();return {hidden:false,get innerHTML(){return this.markup||'';},set innerHTML(value){this.markup=value;for(const m of value.matchAll(/id="([^"]+)"/g))ids.add(m[1]);},textContent:'',value:'',style:{},dataset:{},classList:{toggle(k,value){if(value===undefined)value=!classes.has(k);value?classes.add(k):classes.delete(k);return value;},contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k)},addEventListener(){},setAttribute(){},querySelector(){return el();},querySelectorAll(){return [];}};}
const document={hidden:false,body:el(),querySelector(k){if(k.startsWith('#')&&!ids.has(k.slice(1)))return null;if(!elements.has(k))elements.set(k,el());return elements.get(k);},querySelectorAll(){return [];},addEventListener(){},createElement(){return el();}};
const maps=[];class MapStub{constructor(){this.layers=[];this.sources=new Map();this.events=[];this.loaded=false;maps.push(this);queueMicrotask(()=>{this.loaded=true;for(const e of this.events.filter(e=>e.name==='load'))e.fn();});}on(name,...args){this.events.push({name,fn:args.at(-1)});return this;}isStyleLoaded(){return this.loaded;}getStyle(){return {layers:this.layers};}addControl(){}setPaintProperty(){}setLayoutProperty(){}setFilter(){}addLayer(l){this.layers.push(l);}addSource(id,s){this.sources.set(id,{...s,setData(d){this.data=d;}});}getSource(id){return this.sources.get(id);}getLayer(id){return this.layers.find(l=>l.id===id);}getCanvas(){return {style:{}};}flyTo(x){this.camera=x;this.moves=(this.moves||0)+1;}fire(name,event={}){for(const e of this.events.filter(e=>e.name===name))e.fn(event);}fitBounds(){this.fitted=true;}resize(){}remove(){}getZoom(){return 16;}queryRenderedFeatures(){return [];}project(){return {x:0,y:0};}}
let removed=0;class Marker{constructor(o){this.element=o.element;}setLngLat(p){this.p=p;return this;}setPopup(p){this.popup=p;return this;}getPopup(){return this.popup;}addTo(){return this;}on(){return this;}remove(){removed++;}setDraggable(){return this;}getElement(){return this.element;}getLngLat(){return {lng:this.p[0],lat:this.p[1]};}}
class Popup{setHTML(x){this.html=x;return this;}}class Bounds{extend(){return this;}}
const route={route_id:'r',route_short_name:'5'},trip={trip_id:'t',route_id:'r',shape_id:'shape',trip_headsign:'Centre',direction_id:'0'},stop={id:'a',stop_id:'a',stop_code:'679',name:'Grand Prestizh',lat:42,lon:21.4};
const db={routes:new Map([['r',route]]),trips:new Map([['t',trip]]),stops:[stop,{...stop,id:'b',stop_id:'b',lon:21.41}],times:new Map([['t',[{trip_id:'t',stop_id:'a',seq:1},{trip_id:'t',stop_id:'b',seq:2}]]]),byStop:new Map([['a',[{trip_id:'t'}]],['b',[{trip_id:'t'}]]]),shapes:new Map([['shape',[[21.4,42,1],[21.405,42.003,2],[21.41,42,3]]]])};
const rt={timestamp:Date.now()/1000,sources:{modeshift:true,skopska:true},vehicles:[{id:'1',label:'1001',tripId:'t',routeId:'r',lat:42,lon:21.401,timestamp:Date.now()/1000,seq:1,source:'Modeshift'}]};
let gpsCallback;
const context=vm.createContext({console,Date,Intl,Map,Set,Math,JSON,String,Number,Object,Promise,URL,URLSearchParams,AbortSignal,AbortController,clearTimeout,crypto,fetch:async()=>({ok:true,json:async()=>({articles:[]})}),setTimeout,setInterval(){},queueMicrotask,document,window:{maplibregl:true,scrollTo(){},addEventListener(){}},maplibregl:{Map:MapStub,Marker,Popup,LngLatBounds:Bounds,NavigationControl:class{}},location:{href:'http://localhost/',origin:'http://localhost'},localStorage:{getItem(){return null;},setItem(){}},navigator:{geolocation:{watchPosition(fn){gpsCallback=fn;return 1;},getCurrentPosition(ok){ok({coords:{latitude:42,longitude:21.4,accuracy:15}});}}}});
const transit=new vm.SyntheticModule(['load','realtime','departures','distance','planJourney'],function(){this.setExport('load',async()=>db);this.setExport('realtime',async()=>rt);this.setExport('departures',()=>[{trip,s:{seq:1},route,time:Date.now()+120000,day:{date:'20261001'}}]);this.setExport('distance',()=>100);this.setExport('planJourney',()=>[]);},{context});
const ui=new vm.SourceTextModule(fs.readFileSync('dist/map-ui.js','utf8'),{context});await ui.link(()=>{});
const network=new vm.SourceTextModule(fs.readFileSync('dist/stop-network.js','utf8'),{context});await network.link(()=>ui);
const rideModule=new vm.SourceTextModule(fs.readFileSync('dist/ride.js','utf8'),{context});await rideModule.link(()=>{});
const communityModule=new vm.SourceTextModule(fs.readFileSync('dist/community.js','utf8'),{context});await communityModule.link(()=>{});
const favouritesModule=new vm.SourceTextModule(fs.readFileSync('dist/favourites.js','utf8'),{context});await favouritesModule.link(()=>{});
const newsModule=new vm.SourceTextModule(fs.readFileSync('dist/news.js','utf8'),{context});await newsModule.link(()=>{});
const plannerModules=new Map();async function plannerModule(spec){const file=spec.split('?')[0];if(file==='./stop-network.js')return network;if(file==='./map-ui.js')return ui;if(plannerModules.has(file))return plannerModules.get(file);const module=new vm.SourceTextModule(fs.readFileSync('dist/'+file.slice(2),'utf8'),{context});plannerModules.set(file,module);await module.link(plannerModule);return module;}
for(const file of ['./schedule.js','./planner.js','./journey-store.js','./journey-tools.js'])await plannerModule(file);
const app=new vm.SourceTextModule(fs.readFileSync('dist/app.js','utf8')+'\nglobalThis.test={activate,selectStop,selectTargetStop,openLine,updateVehicles,clearBoardingStop,prepareRide,chooseRideExit,startRide,endRide,rideState:()=>ride,showJourney,endJourney,selectJourneyStep,moveJourneyStep,journeyState:()=>activeJourney,setJourneyResults:r=>journeyResults=r,setJourneyContext:c=>journeyContext=c,updateJourneyInfo,stopNotices,renderSaved,saveForTest:id=>saved.set(id,{routeIds:null,targetStopId:null}),saveStop,filterForTest:ids=>chosenLines=new Set(ids),selection:()=>[...chosenLines],savedState:()=>saved,boarding:()=>stopId,target:()=>targetStopId,vehicleMarkers:()=>vehicleMarkers};',{context});await app.link(spec=>['./schedule.js','./planner.js','./journey-store.js','./place-search.js','./journey-follow.js','./journey-tools.js','./i18n.js','./walking.js','./service-alerts.js'].includes(spec.split('?')[0])?plannerModule(spec):spec.split('?')[0]==='./favourites.js'?favouritesModule:spec.split('?')[0]==='./news.js'?newsModule:spec.split('?')[0]==='./community.js'?communityModule:spec.split('?')[0]==='./ride.js'?rideModule:spec.split('?')[0]==='./map-ui.js'?ui:spec.split('?')[0]==='./stop-network.js'?network:transit);await app.evaluate();
context.test.selectStop('a');await Promise.resolve();assert.equal(maps[0].getSource('station-network').data.features[0].geometry.coordinates.length,3);assert(maps[0].fitted);assert.equal(maps[0].getLayer('reachable-stops').type,'circle');assert.equal(maps[0].getLayer('reachable-stops').minzoom,undefined);assert.equal(document.querySelector('#map-title').textContent,'Grand Prestizh');context.test.selectTargetStop('b');assert.equal(context.test.boarding(),'a');assert.equal(context.test.target(),'b');assert(document.querySelector('#home-content').innerHTML.includes('Direct buses: 5'));
context.test.selectStop('a');assert.equal(context.test.boarding(),null);assert.equal(document.querySelector('#change-stop').hidden,true);context.test.selectStop('b');assert.equal(context.test.boarding(),'b');context.test.clearBoardingStop();assert.equal(context.test.boarding(),null);context.test.selectStop('a');
let marker=context.test.vehicleMarkers().home.get('1001');context.test.updateVehicles();assert.equal(context.test.vehicleMarkers().home.get('1001'),marker);
context.test.openLine('r');await Promise.resolve();assert(maps[1].getLayer('route'));assert.equal(maps[1].getSource('route').data.geometry.coordinates.length,3);assert(context.test.vehicleMarkers().line.has('1001'));
context.test.prepareRide({trip,route,s:{seq:1}});assert.equal(context.test.rideState().trip.trip_id,'t');context.test.chooseRideExit('b');assert.equal(context.test.rideState().exit,1);assert(document.querySelector('#home-content').innerHTML.includes('Start ride'));assert.equal(maps[0].getSource('station-network').data.features.length,1);context.test.activate('home');context.test.startRide();assert.equal(context.test.rideState().follow,true);
let fixTime=Date.now();const fix=()=>gpsCallback({timestamp:++fixTime,coords:{latitude:42,longitude:21.401,accuracy:12}});
fix();assert.equal(maps[0].camera.zoom,undefined,'GPS following preserves the map zoom');
let moves=maps[0].moves;maps[0].fire('dragstart',{originalEvent:{type:'touchmove'}});fix();fix();
assert.equal(maps[0].moves,moves,'GPS must not steal the camera after dragging');
assert.equal(context.test.rideState().follow,false);assert.equal(context.test.rideState().progress.lastTime,fixTime,'Ride tracking continues receiving fixes while browsing');
assert(document.querySelector('#locate').innerHTML.includes('Follow'));
document.querySelector('#locate').onclick();assert.equal(context.test.rideState().follow,true);fix();assert(maps[0].moves>moves);
for(const type of ['zoomstart','movestart','rotatestart']){maps[0].fire(type,{});assert.equal(context.test.rideState().follow,true,'Programmatic movements do not pause following');maps[0].fire(type,{originalEvent:{type:'keydown'}});moves=maps[0].moves;fix();assert.equal(maps[0].moves,moves,'Manual zoom or keyboard navigation pauses following');document.querySelector('#locate').onclick();}
context.test.endRide();assert.equal(context.test.rideState(),null);assert(!document.querySelector('#locate').innerHTML.includes('Follow'));
context.test.prepareRide({trip,route,s:{seq:1}});context.test.chooseRideExit('b');context.test.startRide();assert.equal(context.test.rideState().follow,true,'A new ride starts following');context.test.endRide();
context.test.saveForTest('a');context.test.renderSaved();assert(document.querySelector('#saved-list').innerHTML.includes('Next arrivals'));assert(document.querySelector('#saved-list').innerHTML.includes('Timetable'));context.test.clearBoardingStop();let beforeGps=document.querySelector('#home-content').innerHTML;gpsCallback({timestamp:Date.now(),coords:{latitude:42,longitude:21.4001,accuracy:12}});assert.equal(document.querySelector('#home-content').innerHTML,beforeGps);
const selectedJourney={arrival:Date.now()+900000,legs:[{type:'bus',tripId:'t',route,from:stop,to:db.stops[1],boardSeq:1,endSeq:2,start:Date.now()+120000,end:Date.now()+900000,stops:1},{type:'walk',from:db.stops[1],to:{...db.stops[1],name:'Destination'},meters:100,walkingMs:60000,start:Date.now()+900000,end:Date.now()+960000}]};
context.test.setJourneyResults([selectedJourney]);const mapCount=maps.length;context.test.showJourney(0);await Promise.resolve();assert.equal(maps.length,mapCount,'Selecting a journey reuses the main map');assert(maps[0].getLayer('chosen-journey-bus'));assert(maps[0].getLayer('chosen-journey-walk'));assert.equal(maps[0].getSource('chosen-journey').data.features.length,2);assert(document.querySelector('#home-content').innerHTML.includes('Get off at'));assert(document.body.classList.contains('following-journey'));
context.test.activate('saved');context.test.activate('home');assert(context.test.journeyState(),'Selection persists across tabs');
document.querySelector('#locate').onclick();assert(context.test.journeyState().follow);moves=maps[0].moves;fix();assert(maps[0].moves>moves);maps[0].fire('dragstart',{});moves=maps[0].moves;fix();assert.equal(maps[0].moves,moves,'Journey following pauses when the map is dragged');
context.test.moveJourneyStep(1);assert.equal(context.test.journeyState().step,1);assert(document.querySelector('#home-content').innerHTML.includes('Finish journey'));context.test.moveJourneyStep(-1);assert.equal(context.test.journeyState().step,0);
context.test.endJourney();assert.equal(context.test.journeyState(),null);assert.equal(maps[0].getSource('chosen-journey').data.features.length,0);assert(!document.body.classList.contains('following-journey'));
console.log('Passed: stop selection draws route, stable home badges, line detail route and vehicle rendering');

db.shapes.set('shape',[[21.4,42,1],[25.96,43.85,2],[21.41,42,3]]);context.test.openLine('r');await Promise.resolve();assert(document.querySelector('#line-detail').innerHTML.includes('Approximate stop outline'));assert.equal(maps.at(-1).getSource('route').data.geometry.coordinates.length,2);

// Saving an empty filter must never reopen all routes, including on the active stop.
context.test.selectStop('a',true);context.test.filterForTest([]);context.test.saveStop('a');context.test.renderSaved();
assert(!document.querySelector('#saved-list').innerHTML.includes('saved-arrival-destination'));
context.test.selectStop('a',true);assert.equal(context.test.selection().length,0);
context.test.filterForTest(['r']);context.test.saveStop('a');context.test.renderSaved();
assert(document.querySelector('#saved-list').innerHTML.includes('saved-arrival-destination'));
context.test.clearBoardingStop();context.test.selectStop('a',true);assert.equal(context.test.selection()[0],'r');
context.test.selectTargetStop('b');context.test.saveStop('a');context.test.clearBoardingStop();context.test.selectStop('a',true);assert.equal(context.test.target(),'b');
document.querySelector('#theme').onclick();assert(document.body.classList.contains('dark'));document.querySelector('#theme').onclick();assert(!document.body.classList.contains('dark'));
console.log('Passed: saved filters and destination restoration, empty filters, theme toggling');

// Follow UI retains the appointment deadline and warns after refined walking.
const deadline=Date.now()+1000000;
context.test.setJourneyContext({options:{mode:'arrive',walkingSpeed:4.5},time:deadline});
context.test.setJourneyResults([{...selectedJourney,legs:selectedJourney.legs.map(l=>l.type==='walk'?{...l,walkingMs:600000}:l)}]);
context.test.showJourney(0);
assert(document.querySelector('#home-content').innerHTML.includes('Arrival deadline missed'));
assert(document.querySelector('#home-content').innerHTML.includes('Arrive by'));
assert.equal(document.querySelector('#chosen-journey-arrival').textContent,'Arrival deadline missed');
context.test.endJourney();

// Selected-journey notices must use refreshed times, not the original choice.
context.test.setJourneyContext({options:{mode:'now'},time:Date.now()});
context.test.setJourneyResults([selectedJourney]);
rt.timestamp=Date.now()/1000;rt.alertTimestamp=rt.timestamp;
rt.alerts=[{selectors:[{route:'r'}],periods:[{start:rt.timestamp+1800}],title:[{text:'Later road closure'}]}];
rt.updates=new Map([['t|a|',{departure:{time:rt.timestamp+2400}}],['t|b|',{arrival:{time:rt.timestamp+3000}}]]);
context.test.showJourney(0);context.test.updateJourneyInfo();
assert(document.querySelector('#chosen-journey-alerts').innerHTML.includes('Later road closure'));
context.test.endJourney();

// Stop closure notices survive an empty static departure list.
rt.alerts=[{selectors:[{stop:'a'}],periods:[],title:[{text:'Stop closed'}]}];
context.test.selectStop('a');
assert(context.test.stopNotices().includes('Stop closed'));
rt.alerts=[];rt.updates.clear();
console.log('Passed: visible arrive-by deadline warning and current-time/stop closure alerts');
