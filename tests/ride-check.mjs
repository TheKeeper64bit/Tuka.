import assert from 'node:assert/strict';
import {createProgress,advance} from '../dist/ride.js';
const points=Array.from({length:7},(_,i)=>[21.4+i*.004,42]);
const stops=points.map(([lon,lat],i)=>({id:String(i),lon,lat}));
let state=createProgress(points,stops,5),time=100000;
const fix=(lon,accuracy=12)=>({lat:42,lon,accuracy,timestamp:time+=20000});
assert.equal(advance(state,fix(21.4),time).alert,null);
assert.equal(advance(state,fix(21.402),time).alert,null);
assert.equal(advance(state,fix(21.42,150),time).alert,null);
let before=state.progress;
assert.equal(advance(state,{...fix(21.41),lat:42.02},time).alert,null);assert.equal(state.progress,before);
for(const lon of [21.404,21.408,21.412,21.416])assert.equal(advance(state,fix(lon),time).alert,null);
assert.equal(advance(state,fix(21.418),time).alert,'approach');
assert.equal(advance(state,fix(21.4185),time).alert,null);
assert.equal(advance(state,fix(21.4195),time).alert,'exit');
assert.equal(advance(state,fix(21.42),time).alert,null);
assert.equal(advance(state,{...fix(21.42),timestamp:time-60000},time).alert,null);
let jump=createProgress(points,stops,5);assert.equal(advance(jump,fix(21.42),time).alert,null);assert.equal(jump.progress,0);
console.log('Passed: fifth-stop sequence, early and exit alerts once, inaccurate/off-route/stale fixes rejected, implausible boarding jump rejected');

// A first fix beyond the old 350 m boarding window must reacquire on two fixes.
let late=createProgress(points,stops,5);let one=fix(21.412);assert.equal(advance(late,one,time).status,'Confirming your position on this route');let two=fix(21.413);assert.equal(advance(late,two,time).status,'Tracking your ride');assert(late.progress>900);
// Sparse geometry still projects within a restricted progress window.
let sparse=createProgress([points[0],points.at(-1)],stops,5);assert.equal(advance(sparse,fix(21.4),time).alert,null);advance(sparse,fix(21.401),time);assert(sparse.lastTime>0);
// A paused tracker reacquires after a long gap, without an instant exit alert.
time+=120000;assert.equal(advance(late,fix(21.418),time).alert,null);assert.equal(advance(late,fix(21.4185),time).status,'Tracking your ride');
console.log('Passed: late boarding, sparse shapes and GPS-resume reacquisition');
