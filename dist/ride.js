// Directional route projection. Progress needs consecutive plausible GPS fixes.
const meters=(a,b)=>Math.hypot((a[0]-b[0])*82500,(a[1]-b[1])*111000);
export function measure(points){let cumulative=[0];for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+meters(points[i-1],points[i]));return cumulative;}
export function project(points,cumulative,p,min=0,max=Infinity){let best=null;for(let i=1;i<points.length;i++){let a=points[i-1],b=points[i],dx=(b[0]-a[0])*82500,dy=(b[1]-a[1])*111000,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*82500*dx+(p[1]-a[1])*111000*dy)/l)):0,at=cumulative[i-1]+t*(cumulative[i]-cumulative[i-1]);if(at<min||at>max)continue;let d=meters(p,[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);if(!best||d<best.distance)best={at,distance:d};}return best;}
export function createProgress(points,stops,targetIndex){let cumulative=measure(points),positions=[],start=0;for(const s of stops){let p=project(points,cumulative,[s.lon,s.lat],start);if(!p)throw Error('Missing stop geometry');positions.push(p.at);start=p.at;}return {points,cumulative,positions,targetIndex,progress:positions[0],lastTime:0,confidence:0,notified:new Set()};}
export function advance(state,fix,now=Date.now()){
 if(!Number.isFinite(fix.lat)||!Number.isFinite(fix.lon)||!Number.isFinite(fix.accuracy)||fix.accuracy>60||!Number.isFinite(fix.timestamp)||now-fix.timestamp>20000||fix.timestamp>now+5000)return {status:'Waiting for accurate GPS',alert:null};
 if(fix.timestamp<=state.lastTime)return {status:'Waiting for a new GPS fix',alert:null};
 const elapsed=state.lastTime?(fix.timestamp-state.lastTime)/1000:0;
 const max=state.lastTime?state.progress+Math.min(2000,elapsed*25+80):state.progress+350;
 const hit=project(state.points,state.cumulative,[fix.lon,fix.lat],Math.max(0,state.progress-70),max);
 if(!hit||hit.distance>Math.max(45,fix.accuracy+20)){state.confidence=0;return {status:'GPS is away from the selected route',alert:null};}
 state.lastTime=fix.timestamp;state.progress=Math.max(state.progress,hit.at);state.confidence++;
 const end=state.positions[state.targetIndex],previous=state.positions[state.targetIndex-1],remaining=end-state.progress;
 let passed=0;for(let i=1;i<state.positions.length;i++)if(state.progress>state.positions[i]+25)passed=i;
 let alert=null;
 if(state.confidence>=2&&state.progress>state.positions[0]+30){
  const type=remaining < -120?'missed':remaining<=70?'exit':state.progress>=previous+25&&remaining<=350?'approach':null;
  if(type&&!state.notified.has(type)){state.notified.add(type);alert=type;}
 }
 return {status:'Tracking your ride',passed,remainingStops:Math.max(0,state.targetIndex-passed),meters:Math.max(0,remaining),alert};
}
