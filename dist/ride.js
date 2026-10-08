// Match fixes to a directional route; reacquire after boarding late or resuming GPS.
const meters=(a,b)=>Math.hypot((a[0]-b[0])*82500,(a[1]-b[1])*111000);
export function measure(points){let cumulative=[0];for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+meters(points[i-1],points[i]));return cumulative;}
export function project(points,cumulative,p,min=0,max=Infinity){let best=null;for(let i=1;i<points.length;i++){let a=points[i-1],b=points[i],length=cumulative[i]-cumulative[i-1];if(!length||cumulative[i]<min||cumulative[i-1]>max)continue;let dx=(b[0]-a[0])*82500,dy=(b[1]-a[1])*111000,t=((p[0]-a[0])*82500*dx+(p[1]-a[1])*111000*dy)/(dx*dx+dy*dy);t=Math.max(Math.max(0,(min-cumulative[i-1])/length),Math.min(Math.min(1,(max-cumulative[i-1])/length),t));let at=cumulative[i-1]+t*length,d=meters(p,[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);if(!best||d<best.distance)best={at,distance:d};}return best;}
export function createProgress(points,stops,targetIndex){let cumulative=measure(points),positions=[],start=0;for(const s of stops){let p=project(points,cumulative,[s.lon,s.lat],start);if(!p)throw Error('Missing stop geometry');positions.push(p.at);start=p.at;}return {points,cumulative,positions,targetIndex,progress:positions[0],lastTime:0,confidence:0,notified:new Set(),candidate:null};}
export function advance(state,fix,now=Date.now()){
 if(!Number.isFinite(fix.lat)||!Number.isFinite(fix.lon)||!Number.isFinite(fix.accuracy)||fix.accuracy>60||!Number.isFinite(fix.timestamp)||now-fix.timestamp>20000||fix.timestamp>now+5000)return {status:'Waiting for accurate GPS',alert:null};
 if(fix.timestamp<=state.lastTime)return {status:'Waiting for a new GPS fix',alert:null};
 const tolerance=Math.max(90,fix.accuracy+35),elapsed=state.lastTime?(fix.timestamp-state.lastTime)/1000:0;
 let hit=state.lastTime?project(state.points,state.cumulative,[fix.lon,fix.lat],Math.max(0,state.progress-100),state.progress+Math.min(5000,elapsed*30+150)):null;
 if(!hit||hit.distance>tolerance||elapsed>45){
  hit=project(state.points,state.cumulative,[fix.lon,fix.lat],state.lastTime?Math.max(0,state.progress-100):0);
  if(!hit||hit.distance>tolerance){state.candidate=null;state.confidence=0;return {status:'GPS is away from the selected route',alert:null};}
  const prior=state.candidate,seconds=prior?(fix.timestamp-prior.time)/1000:0;
  if(!prior||seconds<=0||seconds>30||Math.abs(hit.at-prior.at)>seconds*30+100){state.candidate={at:hit.at,time:fix.timestamp};return {status:'Confirming your position on this route',alert:null};}
  state.confidence=1;state.candidate=null;
 }
 state.lastTime=fix.timestamp;state.progress=Math.max(state.progress,hit.at);state.confidence++;
 const end=state.positions[state.targetIndex],previous=state.positions[state.targetIndex-1],remaining=end-state.progress;
 let passed=0;for(let i=1;i<state.positions.length;i++)if(state.progress>state.positions[i]+25)passed=i;
 let alert=null;
 if(state.confidence>=2&&state.progress>state.positions[0]+30){const type=remaining < -120?'missed':remaining<=90?'exit':state.progress>=previous+15&&remaining<=450?'approach':null;if(type&&!state.notified.has(type)){state.notified.add(type);alert=type;}}
 return {status:'Tracking your ride',passed,remainingStops:Math.max(0,state.targetIndex-passed),meters:Math.max(0,remaining),alert};
}
