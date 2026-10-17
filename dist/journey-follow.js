import {boardingNetwork,routeColor} from './stop-network.js?v=20';
import {distance,eventTime,prediction,serviceDay,localDate} from './schedule.js?v=24';

const coordinates=p=>[p.lon,p.lat];
const collection=features=>({type:'FeatureCollection',features});
const serviceDate=leg=>leg.serviceDate||localDate(leg.start).replaceAll('-','');

// Use the same validated trip geometry as the stop map, trimmed to this leg.
export function journeyGeometry(db,result){
  const byId=new Map(db.stops.map(s=>[s.id,s])),features=[],stops=[];
  result.legs.forEach((leg,index)=>{
    let points=[],approximate=leg.type!=='bus';
    const color=leg.type==='bus'?routeColor(leg.route.route_id):'#728595';
    if(leg.type==='bus'){
      const times=db.times.get(leg.tripId)||[];
      const board=times.findIndex(s=>s.seq===leg.boardSeq),end=times.findIndex((s,i)=>i>board&&s.seq===leg.endSeq);
      const calls=board>=0&&end>board?times.slice(board,end+1):[];
      const pattern=boardingNetwork(db,leg.from.id).patterns.find(p=>p.tripIds.has(leg.tripId)&&p.downstream[0].seq===leg.boardSeq);
      if(pattern&&calls.length){
        let last=0;
        for(const call of calls){const stop=byId.get(call.stop_id);if(!stop)continue;let best=Infinity,at=last;for(let j=last;j<pattern.points.length;j++){const d=distance(stop,{lon:pattern.points[j][0],lat:pattern.points[j][1]});if(d<best){best=d;at=j;}}last=at;}
        points=pattern.points.slice(0,last+1);approximate=pattern.approximate;
      }
      if(points.length<2){points=calls.map(s=>byId.get(s.stop_id)).filter(Boolean).map(coordinates);approximate=true;}
      stops.push({type:'Feature',geometry:{type:'Point',coordinates:coordinates(leg.from)},properties:{step:index,label:String(leg.route.route_short_name),color}});
      stops.push({type:'Feature',geometry:{type:'Point',coordinates:coordinates(leg.to)},properties:{step:index,label:'↓',color}});
    }
    if(leg.type!=='bus'&&leg.walkingPath){points=leg.walkingPath;approximate=false;}
    if(points.length<2){points=[coordinates(leg.from),coordinates(leg.to)];approximate=true;}
    features.push({type:'Feature',geometry:{type:'LineString',coordinates:points},properties:{step:index,color,walk:leg.type!=='bus',approximate}});
  });
  const start=result.legs[0];if(start&&!stops.some(s=>distance(start.from,{lon:s.geometry.coordinates[0],lat:s.geometry.coordinates[1]})<20))stops.unshift({type:'Feature',geometry:{type:'Point',coordinates:coordinates(start.from)},properties:{step:0,label:'S',color:'#0865d6'}});
  const end=result.legs.at(-1);
  if(end)stops.push({type:'Feature',geometry:{type:'Point',coordinates:coordinates(end.to)},properties:{step:result.legs.length-1,label:'D',color:'#cf3b79'}});
  const distinct=stops.filter((s,i)=>!stops.slice(i+1).some(next=>next.properties.label==='D'&&distance({lon:s.geometry.coordinates[0],lat:s.geometry.coordinates[1]},{lon:next.geometry.coordinates[0],lat:next.geometry.coordinates[1]})<10));
  return {paths:collection(features),stops:collection(distinct)};
}

export function journeyOverlay(map,geometry,step=0){
  if(!map?.getSource('stops'))return;
  for(const [id,data] of [['chosen-journey',geometry?.paths||collection([])],['chosen-journey-stops',geometry?.stops||collection([])]]){
    if(map.getSource(id))map.getSource(id).setData(data);else map.addSource(id,{type:'geojson',data});
  }
  if(!map.getLayer('chosen-journey-bus')){
    const before='stops',layout={'line-cap':'round','line-join':'round'};
    map.addLayer({id:'chosen-journey-halo',type:'line',source:'chosen-journey',layout,paint:{'line-color':'#fff','line-width':8,'line-opacity':.7}},before);
    map.addLayer({id:'chosen-journey-bus',type:'line',source:'chosen-journey',filter:['==',['get','walk'],false],layout,paint:{'line-color':['get','color'],'line-width':5}},before);
    map.addLayer({id:'chosen-journey-walk',type:'line',source:'chosen-journey',filter:['==',['get','walk'],true],paint:{'line-color':'#728595','line-width':4,'line-dasharray':[2,2]}},before);
    map.addLayer({id:'chosen-journey-stops',type:'circle',source:'chosen-journey-stops',paint:{'circle-color':['get','color'],'circle-radius':10,'circle-stroke-color':'#fff','circle-stroke-width':2}});
    map.addLayer({id:'chosen-journey-labels',type:'symbol',source:'chosen-journey-stops',layout:{'text-field':['get','label'],'text-font':['Noto Sans Regular'],'text-size':11,'text-allow-overlap':true},paint:{'text-color':'#fff'}});
  }
  for(const layer of ['chosen-journey-bus','chosen-journey-walk'])map.setPaintProperty(layer,'line-opacity',['case',['==',['get','step'],step],1,.55]);
}

export function journeyVehicles(rt,result,now=Date.now()){
  const today=serviceDay(0,now).date;
  return (rt?.vehicles||[]).filter(v=>Number.isFinite(v.lat)&&Number.isFinite(v.lon)&&now/1000-v.timestamp<=120&&v.timestamp<=now/1000+15&&result.legs.some(l=>l.type==='bus'&&l.tripId===v.tripId&&(v.date?v.date===serviceDate(l):serviceDate(l)===today)&&(!v.seq||v.seq<=l.endSeq)));
}

// Refresh this exact itinerary. Do not silently swap buses or carry old live
// labels forward after a prediction expires.
export function journeyStatus(db,rt,result,now=Date.now(),deadline=null){
  const legs=result.legs.map(leg=>{
    if(leg.type!=='bus')return {...leg};
    const date=serviceDate(leg),day=serviceDay(0,date.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'));
    const times=db.times.get(leg.tripId)||[];
    const departure=prediction(rt,leg.tripId,leg.from.id,day,now,now),arrival=prediction(rt,leg.tripId,leg.to.id,day,now,now);
    let start,end,previous=-Infinity,previousLive=false,cancelled=departure?.tripRelationship===3||arrival?.tripRelationship===3;
    // Match the planner's whole-run chronology. A prediction before boarding or
    // at an intermediate call can constrain both boarding and alighting, even
    // when those two stops have no prediction of their own.
    for(const call of times){
      const update=prediction(rt,leg.tripId,call.stop_id,day,now,now);
      cancelled ||= update?.tripRelationship===3;
      const scheduled=Number.isFinite(call.seconds)?day.midnight+call.seconds*1000:call.seq===leg.boardSeq?leg.start:call.seq===leg.endSeq?leg.end:NaN;
      const atStop=eventTime(update,'arrival',Number.isFinite(call.arrivalSeconds)?day.midnight+call.arrivalSeconds*1000:scheduled);
      const leaving=eventTime(update,'departure',scheduled);
      if(atStop.time<previous){atStop.time=previous;atStop.live ||= previousLive;}
      if(leaving.time<atStop.time){leaving.time=atStop.time;leaving.live ||= atStop.live;}
      if(Number.isFinite(leaving.time)){previous=leaving.time;previousLive=leaving.live;}
      if(call.seq===leg.boardSeq)start=leaving;
      if(call.seq===leg.endSeq)end=atStop;
    }
    // An older saved itinerary may outlive the exact stop-time rows in a newly
    // downloaded timetable. Retain its times without retaining stale live labels.
    start??=eventTime(departure,'departure',leg.start);
    end??=eventTime(arrival,'arrival',leg.end);
    if(end.time<start.time){end.time=start.time;end.live ||= start.live;}
    return {...leg,start:start.time,end:end.time,live:start.live,arrivalLive:end.live,cancelled,skipped:departure?.relationship===1||arrival?.relationship===1};
  });
  for(let i=0;i<legs.length;i++)if(legs[i].type==='transfer'&&legs[i-1]?.type==='bus'&&legs[i+1]?.type==='bus'){
    const leg=legs[i],availableMs=legs[i+1].start-legs[i-1].end,walkingMs=leg.walkingMs||0,bufferMs=leg.bufferMs||0,marginMs=availableMs-walkingMs-bufferMs;
    leg.connection={...leg.connection,availableMs,walkingMs,bufferMs,marginMs,tight:marginMs<120000,live:legs[i-1].arrivalLive&&legs[i+1].live};
  }
  const lastBus=legs.findLastIndex(l=>l.type==='bus');
  const arrival=lastBus<0?result.departure+legs.reduce((ms,l)=>ms+(l.walkingMs||0),0):legs[lastBus].end+legs.slice(lastBus+1).reduce((ms,l)=>ms+(l.walkingMs||0)+(l.bufferMs||0),0);
  const firstBus=legs.findIndex(l=>l.type==='bus'),accessMissed=firstBus>0&&legs[0].start+legs.slice(0,firstBus).reduce((ms,l)=>ms+(l.walkingMs||0),0)>legs[firstBus].start;
  const latenessMs=Number.isFinite(deadline)?Math.max(0,arrival-deadline):0,deadlineMissed=latenessMs>0;
  return {legs,arrival,deadlineMissed,latenessMs,disrupted:deadlineMissed||accessMissed||legs.some(l=>l.cancelled||l.skipped||l.connection?.marginMs<0),live:legs.some(l=>l.live||l.arrivalLive)};
}
