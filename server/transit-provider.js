import {providerFor} from '../dist/city-providers.js';
import {credibleShape} from '../dist/map-ui.js';
export const REALTIME_SOURCES={
 boston:{trips:'https://cdn.mbta.com/realtime/TripUpdates.pb',vehicles:'https://cdn.mbta.com/realtime/VehiclePositions.pb',alerts:'https://cdn.mbta.com/realtime/Alerts.pb'},
 minneapolis:{trips:'https://svc.metrotransit.org/mtgtfs/tripupdates.pb',vehicles:'https://svc.metrotransit.org/mtgtfs/vehiclepositions.pb',alerts:'https://svc.metrotransit.org/mtgtfs/alerts.pb'},
 springfield:{trips:'https://ride.smtd.org/gtfsrt/trips',vehicles:'https://ride.smtd.org/gtfsrt/vehicles',alerts:'https://ride.smtd.org/gtfsrt/alerts'},
 norfolk:{trips:'https://gtfs.gohrt.com/gtfs-rt/TripUpdates.pb',alerts:'https://gtfs.gohrt.com/gtfs-rt/Alerts.pb'},
};
export async function transitFeed(request){
 const url=new URL(request.url),parts=url.pathname.split('/'),upstreamUrl=REALTIME_SOURCES[parts[3]]?.[parts[4]];
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 if(parts.length!==5||!upstreamUrl||url.search)return Response.json({error:'Unknown feed'},{status:400});
 try{
  const upstream=await fetch(upstreamUrl,{headers:{Accept:'application/x-protobuf'},cf:{cacheEverything:true,cacheTtl:20},signal:AbortSignal.timeout(10000)});
  if(!upstream.ok)throw Error('Feed unavailable');
  // Stream official public data. Judge cookies and user-supplied URLs never go upstream.
  return new Response(upstream.body,{headers:{'Content-Type':'application/x-protobuf','Cache-Control':'private, max-age=15','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({error:'Live feed unavailable. Scheduled service remains available.'},{status:503});}
}
export async function roadGeometry(request,env){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 let data;try{const reader=request.body?.getReader();if(!reader)throw Error();let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16000)throw Error();chunks.push(value);}}finally{await reader.cancel();}data=JSON.parse(await new Blob(chunks).text());}catch{return Response.json({error:'Invalid route request'},{status:400});}
 const provider=providerFor(data.cityId),points=data.points,[w,s,e,n]=provider.bounds;
 if(provider.id!==data.cityId||!Array.isArray(points)||points.length<2||points.length>100||points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<w||p[0]>e||p[1]<s||p[1]>n))return Response.json({error:'Invalid ordered stops'},{status:400});
 // An operator-configured driving engine is optional. A foot/car path is never
 // called the published bus alignment; the UI retains an approximation label.
 if(!env.BUS_ROUTER_URL)return Response.json({error:'Road routing is not configured. Showing the stop outline.'},{status:503});
 try{
  const base=new URL(env.BUS_ROUTER_URL);if(base.protocol!=='https:')throw Error();
  const key=points.map(p=>p.map(x=>x.toFixed(5)).join(',')).join(';');
  const response=await fetch(`${base.href.replace(/\/$/,'')}/${key}?overview=full&geometries=geojson`,{cf:{cacheEverything:true,cacheTtl:86400},signal:AbortSignal.timeout(8000)});
  if(!response.ok||Number(response.headers.get('content-length'))>1000000)throw Error();
  const reader=response.body.getReader();let size=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1000000)throw Error();chunks.push(value);}}finally{await reader.cancel();}
  const payload=JSON.parse(await new Blob(chunks).text()),coordinates=payload.routes?.[0]?.geometry?.coordinates;
  if(payload.code!=='Ok'||!Array.isArray(coordinates)||coordinates.length>20000||!credibleShape(coordinates,points))throw Error();
  return Response.json({points:coordinates,approximate:true,kind:'road',label:'Estimated road path'}, {headers:{'Cache-Control':'private, max-age=3600'}});
 }catch{return Response.json({error:'No validated road route. Showing the stop outline.'},{status:503});}
}
