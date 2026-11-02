import {routeGeometry,trimGeometry} from './map-ui.js?v=21';
const colors=['#1768df','#8b51ce','#087f79','#bd5628','#bf3970','#607526','#5661b1','#a37915'];
export function routeColor(id){let h=0;for(const c of String(id))h=(h*31+c.charCodeAt(0))>>>0;return colors[h%colors.length];}
const boards=s=>s.pickup_type!=='1',alights=s=>s.drop_off_type!=='1';
export function connection(db,tripId,from,to,minSeq=0){
  const times=db.times.get(tripId)||[];
  for(let i=0;i<times.length;i++)if(times[i].stop_id===from&&times[i].seq>=minSeq&&boards(times[i])){
    for(let j=i+1;j<times.length;j++)if(times[j].stop_id===to&&alights(times[j]))return {board:times[i],end:times[j],count:j-i};
  }
  return null;
}
export function arrivalConnects(db,a,from,to){
  if(!to)return true;
  if(!a.unmatched)return !!connection(db,a.trip.trip_id,from,to,a.s.seq);
  // An independent estimate needs its own complete directional stop pattern.
  const path=a.path||[],start=path.indexOf(from);return start>=0&&path.indexOf(to,start+1)>start;
}
export function vehicleServes(db,v,from,to,now=Date.now()/1000){
  if(!Number.isFinite(v.lat)||!Number.isFinite(v.lon)||!Number.isFinite(v.timestamp)||now-v.timestamp>120||v.timestamp>now+15||!Number.isInteger(v.seq)||v.seq<1)return false;
  if(v.tripId&&db.trips.has(v.tripId)){
    const times=db.times.get(v.tripId)||[];
    return times.some(s=>s.stop_id===from&&s.seq>=v.seq&&boards(s)&&(!to||connection(db,v.tripId,from,to,s.seq)));
  }
  const path=v.stops||[];
  return path.some((s,i)=>s.id===from&&s.seq>=v.seq&&(!to||path.slice(i+1).some(x=>x.id===to)));
}
export function boardingNetwork(db,from){
  db.stopNetworks??=new Map();if(db.stopNetworks.has(from))return db.stopNetworks.get(from);
  const byId=db.stopIndex||new Map(db.stops.map(s=>[s.id,s])),patterns=new Map(),reachable=new Map(),routes=new Map();
  for(const call of db.byStop.get(from)||[]){
    const trip=db.trips.get(call.trip_id),route=db.routes.get(trip?.route_id),times=db.times.get(call.trip_id)||[];
    if(!trip||!route)continue;
    for(let i=0;i<times.length;i++){
      if(times[i].stop_id!==from||!boards(times[i]))continue;
      const downstream=times.slice(i),destinations=downstream.slice(1).filter(alights);
      if(!destinations.length)continue;
      const key=JSON.stringify([route.route_id,trip.direction_id,db.shapes.has(trip.shape_id)?trip.shape_id:null,downstream.map(s=>[s.stop_id,s.pickup_type,s.drop_off_type])]);
      if(patterns.has(key)){patterns.get(key).tripIds.add(trip.trip_id);continue;}
      const geometry=routeGeometry(db,trip);let points=geometry.points;
      if(!geometry.approximate||geometry.kind==='road'){
        points=trimGeometry(points,times.map(s=>byId.get(s.stop_id)).map(s=>[s.lon,s.lat]),i);
      }else points=downstream.every(s=>byId.has(s.stop_id))?downstream.map(s=>byId.get(s.stop_id)).map(s=>[s.lon,s.lat]):[];
      const pattern={key,trip,route,tripIds:new Set([trip.trip_id]),downstream,points,approximate:geometry.approximate,geometryKind:geometry.kind,color:routeColor(route.route_id)};
      patterns.set(key,pattern);routes.set(route.route_id,route);
      for(const s of destinations){const stop=byId.get(s.stop_id);if(!stop||stop.id===from)continue;if(!reachable.has(stop.id))reachable.set(stop.id,{stop,routeIds:new Set()});reachable.get(stop.id).routeIds.add(route.route_id);}
    }
  }
  // Resolve palette collisions across every route at this stop before filtering.
  // A route retains its colour when another route is hidden or restored.
  const routeColors=new Map(),used=new Set();
  for(const id of [...routes.keys()].sort((a,b)=>String(a).localeCompare(String(b),'en',{numeric:true}))){
    const start=colors.indexOf(routeColor(id));let color;
    for(let n=0;n<colors.length;n++){const candidate=colors[(start+n)%colors.length];if(!used.has(candidate)){color=candidate;break;}}
    color??=`hsl(${Math.round((routeColors.size-colors.length)*137.508+20)%360}, 70%, 43%)`;
    used.add(color);routeColors.set(id,color);
  }
  for(const pattern of patterns.values())pattern.color=routeColors.get(pattern.route.route_id);
  const result={patterns:[...patterns.values()],reachable,routes,routeColors};db.stopNetworks.set(from,result);return result;
}
export function visibleNetwork(network,chosen,to){
  const patterns=network.patterns.filter(p=>chosen.has(p.route.route_id)&&(!to||p.downstream.slice(1).some(s=>s.stop_id===to&&alights(s))));
  const allowed=new Set(patterns.map(p=>p.route.route_id));
  const stops=[...network.reachable.values()].filter(x=>[...x.routeIds].some(id=>allowed.has(id))&&patterns.some(p=>p.downstream.slice(1).some(s=>s.stop_id===x.stop.id&&alights(s))));
  return {patterns,stops};
}
