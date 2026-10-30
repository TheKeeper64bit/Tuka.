import {normalizeGTFS,seconds} from './gtfs.js?v=1';
export {seconds} from './gtfs.js?v=1';
import {decodeAlert} from './service-alerts.js?v=26';
import {additional,mergeAdditional,mergeArrivals} from './live.js?v=16';
import {providerFor} from './city-providers.js?v=1';
export const BASE=providerFor('skopje').gtfsUrl.replace(/gtfs\/gtfs\.zip$/,'');
import {serviceDay,active,prediction,eventTime} from './schedule.js?v=24';
export {serviceDay,active,distance} from './schedule.js?v=24';
export {planJourney} from './planner.js?v=24';
function csv(s){let rows=[],row=[],v='',q=false;for(let i=0;i<s.length;i++){let c=s[i];if(c==='"'){if(q&&s[i+1]==='"'){v+='"';i++}else q=!q}else if(c===','&&!q){row.push(v);v=''}else if(c==='\n'&&!q){row.push(v.replace(/\r$/,''));rows.push(row);row=[];v=''}else v+=c}if(v||row.length){row.push(v.replace(/\r$/,''));rows.push(row)}let h=rows.shift();return rows.filter(r=>r.length===h.length).map(r=>Object.fromEntries(h.map((k,i)=>[k.replace(/^\uFEFF/,''),r[i]])))}
export async function parseGTFSZip(ab){let v=new DataView(ab),b=new Uint8Array(ab),out={};let e=b.length-22;while(e>=0&&v.getUint32(e,true)!==0x06054b50)e--;if(e<0)throw Error('Invalid ZIP');let p=v.getUint32(e+16,true),n=v.getUint16(e+10,true);for(let i=0;i<n;i++){let method=v.getUint16(p+10,true),size=v.getUint32(p+20,true),nl=v.getUint16(p+28,true),el=v.getUint16(p+30,true),cl=v.getUint16(p+32,true),local=v.getUint32(p+42,true),name=new TextDecoder().decode(b.slice(p+46,p+46+nl));let start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true),data=b.slice(start,start+size);if(name.endsWith('.txt')){if(method===8)data=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());else if(method!==0)throw Error('Unsupported ZIP');out[name]=csv(new TextDecoder().decode(data))}p+=46+nl+el+cl}return out}
export async function load({offlineOnly=false,cityId='skopje'}={}){
 const provider=providerFor(cityId),url=provider.scheduleAsset||provider.gtfsUrl;let r,cached=false;
 try{if(offlineOnly)throw Error('Offline');r=await fetch(url,{credentials:provider.scheduleAsset?'same-origin':'omit',signal:AbortSignal.timeout(30000)});if(!r.ok||r.redirected)throw Error('Schedule HTTP '+r.status);}
 catch(error){if(typeof caches!=='undefined')r=await caches.match(url);if(!r)throw error;cached=true;}
 const copy=r.clone();let db;
 if(provider.scheduleAsset){const data=await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();if(data.format!=='tuka-gtfs-patterns-v1'||data.cityId!==cityId)throw Error('Wrong city schedule');db=normalizeGTFS(data.tables,cityId,data);db.feedSource=data.source;}
 else db=normalizeGTFS(await parseGTFSZip(await r.arrayBuffer()),cityId);
 db.cached=cached;db.downloadedAt=r.headers.get('x-tuka-downloaded-at')||(!cached?new Date().toISOString():null);
 if(!cached&&typeof caches!=='undefined')try{const cache=await caches.open('tuka-schedule'),headers=new Headers(copy.headers);headers.set('x-tuka-downloaded-at',db.downloadedAt);await cache.put(url,new Response(copy.body,{headers}));}catch{}
 return db;
}
function fields(b){let p=0,out={};function varint(){let v=0n,shift=0n;while(p<b.length){let c=b[p++];v|=BigInt(c&127)<<shift;if(!(c&128))return Number(BigInt.asIntN(64,v));shift+=7n}throw Error('Invalid protobuf')}while(p<b.length){let tag=varint(),k=tag>>3,w=tag&7,val;if(w===0)val=varint();else if(w===2){let n=varint();val=b.slice(p,p+n);p+=n}else if(w===1){p+=8;continue}else if(w===5){val=new DataView(b.buffer,b.byteOffset+p,4).getFloat32(0,true);p+=4}else throw Error('Unsupported protobuf');(out[k]??=[]).push(val)}return out}
const str=b=>b?new TextDecoder().decode(b):'';const first=(f,k)=>f[k]?.[0];
function readEvent(raw){if(!raw)return null;const f=fields(raw);let delay=first(f,1);if(delay>2147483647)delay-=4294967296;return {time:first(f,2),delay};}
export function decodeRealtime(bytes,source='Modeshift'){let f=fields(bytes),head=fields(first(f,1)),timestamp=first(head,3),updates=new Map(),vehicles=[],alerts=[];for(let raw of f[2]||[]){let entity=fields(raw);if(first(entity,2))continue;if(first(entity,5))alerts.push(decodeAlert(first(entity,5),fields));if(first(entity,4)){let v=fields(first(entity,4)),td=first(v,1)?fields(first(v,1)):{},p=first(v,2)?fields(first(v,2)):{},descriptor=first(v,8)?fields(first(v,8)):{};if(first(p,1)!=null&&first(p,2)!=null)vehicles.push({id:str(first(descriptor,1))||str(first(entity,1)),label:str(first(descriptor,2)),tripId:str(first(td,1)),routeId:str(first(td,5)),date:str(first(td,3)),lat:first(p,1),lon:first(p,2),bearing:first(p,3),timestamp:first(v,5)||timestamp,seq:first(v,3),stopId:str(first(v,7))})}if(!first(entity,3))continue;let u=fields(first(entity,3)),trip=fields(first(u,1)),id=str(first(trip,1)),start=str(first(trip,3)),rel=first(trip,4);if(rel===3)updates.set(id+'|*|'+start,{tripRelationship:rel});for(let rawstop of u[2]||[]){let s=fields(rawstop),event=first(s,2)||first(s,3),ev=event?fields(event):{},delay=first(ev,1);if(delay>2147483647)delay-=4294967296;updates.set(id+'|'+str(first(s,4))+'|'+start+'|'+(first(s,1)??''),{time:first(ev,2),delay,arrival:readEvent(first(s,2)),departure:readEvent(first(s,3)),relationship:first(s,5),tripRelationship:rel,seq:first(s,1),tripId:id,stopId:str(first(s,4)),serviceDate:start,source})}}return {timestamp,alertTimestamp:timestamp,alerts,updates,vehicles:vehicles.map(v=>({...v,source})),modeshift:source==='Modeshift'}}
async function mainRealtime(){const response=await fetch(providerFor('skopje').realtime.url,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Realtime HTTP '+response.status);return normalizeRealtime(decodeRealtime(new Uint8Array(await response.arrayBuffer())),null);}
export async function realtime(db,stopId,onPrimary){if(db?.provider&&db.provider!=='skopje')return providerRealtime(db); const code=db?.stops.find(s=>s.id===stopId)?.stop_code;const [main,extra]=await Promise.allSettled([mainRealtime().then(r=>{if(onPrimary&&Math.abs(Date.now()/1000-r.timestamp)<120)onPrimary({...r,sources:{modeshift:true,skopska:false}});return r;}),db?additional(code):Promise.reject(Error('No network'))]);if(main.status==='rejected'&&extra.status==='rejected')throw Error('Live data unavailable');let rt=main.status==='fulfilled'?main.value:{timestamp:0,updates:new Map(),vehicles:[],modeshift:false};if(Math.abs(Date.now()/1000-rt.timestamp)>120){rt.updates.clear();rt.vehicles=[];rt.modeshift=false;}const day=serviceDay(0,Date.now(),db?.timezone);if(extra.status==='fulfilled'&&db)rt=mergeAdditional(db,rt,extra.value,day,active(db,day));else rt.sources={modeshift:!!rt.modeshift,skopska:false};return rt}
function scheduledDepartures(db,rt,id,now=Date.now(),limit=16,options={}){let list=[];const zone=db?.timezone,lookback=Math.ceil((db.byStop.get(id)||[]).reduce((n,p)=>Math.max(n,Number.isFinite(p.seconds)?p.seconds:0),86400)/86400);for(let offset=-lookback;offset<=1;offset++){let day=serviceDay(offset,now,zone),ids=active(db,day);for(let s of db.byStop.get(id)||[]){let trip=db.trips.get(s.trip_id);if(!Number.isFinite(s.seconds)||!trip||!ids.has(trip.service_id)||s.pickup_type==='1')continue;let predicted=prediction(rt,s.trip_id,id,day,now,Date.now(),zone,s.seq);if(predicted?.relationship===1||predicted?.tripRelationship===3)continue;let scheduled=day.midnight+s.seconds*1000;let estimate=eventTime(predicted,'departure',scheduled),time=estimate.time;if(time<now-20000||time>now+(options.horizonHours||4)*3600000)continue;list.push({trip,s,route:db.routes.get(trip.route_id),time,scheduled,live:estimate.live,source:predicted?.source||'Modeshift',day})}}return list.sort((a,b)=>a.time-b.time).slice(0,limit)}
export function departures(db,rt,id,now=Date.now(),limit=16,options={}){if(db.provider&&db.provider!=='skopje')return scheduledDepartures(db,rt,id,now,limit,options);return mergeArrivals(db,Math.abs(now-Date.now())<120000?rt:null,id,scheduledDepartures(db,rt,id,now,Math.max(200,limit),options),now,serviceDay(0,now,db?.timezone)).slice(0,limit)}

export function normalizeRealtime(feed,db,now=Date.now()){
 const fresh=t=>Number.isFinite(t)&&now/1000-t<120&&t<=now/1000+15;
 if(!fresh(feed.timestamp))return {...feed,updates:new Map(),vehicles:[],alerts:[],timestamp:0};
 const updates=new Map();
 for(const [key,u] of feed.updates){
  if(key.includes('|*|')){if(!db||db.trips.has(key.split('|')[0]))updates.set(key,u);continue;}
  const [tripId,stopId,date,sequence]=key.split('|');
  if(!db){updates.set(`${tripId}|${stopId}|${date}`,u);continue;}
  const path=db.times.get(tripId);if(!path)continue;
  const matches=path.filter(p=>(!stopId||p.stop_id===stopId)&&(!sequence||String(p.seq)===sequence));
  if(matches.length!==1)continue;
  const call=matches[0];updates.set(`${tripId}|${call.stop_id}|${date}|${call.seq}`,{...u,seq:call.seq});
 }
 const vehicles=feed.vehicles.filter(v=>{
  if(!fresh(v.timestamp)||!Number.isFinite(v.lon)||!Number.isFinite(v.lat)||Math.abs(v.lon)>180||Math.abs(v.lat)>90)return false;
  if(!db)return true;
  const trip=db.trips.get(v.tripId),path=db.times.get(v.tripId);
  if(!trip||!path||v.routeId&&v.routeId!==trip.route_id)return false;
  if(v.date&&!/^\d{8}$/.test(v.date))return false;
  let day;try{day=serviceDay(0,v.date?v.date.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'):now,db.timezone);}catch{return false;}
  if(v.date&&day.date!==v.date)return false;
  if(!active(db,day).has(trip.service_id))return false;
  if(!Number.isInteger(v.seq)){const matches=path.filter(p=>p.stop_id===v.stopId);if(matches.length!==1)return false;v.seq=matches[0].seq;}
  return path.some(p=>p.seq===v.seq&&(!v.stopId||p.stop_id===v.stopId));
 });
 return {...feed,updates,vehicles};
}
async function providerRealtime(db){
 const provider=providerFor(db.provider),urls=provider.realtime?.feeds||[];
 if(!urls.length)return {timestamp:0,updates:new Map(),vehicles:[],alerts:[],sources:{},available:false};
 const responses=await Promise.allSettled(urls.map(async url=>{const response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('Feed unavailable');return normalizeRealtime(decodeRealtime(new Uint8Array(await response.arrayBuffer()),provider.label),db);}));
 const feeds=responses.filter(r=>r.status==='fulfilled').map(r=>r.value);
 if(!feeds.length)throw Error('Live feeds unavailable');
 const updated=feeds.find(f=>f.updates.size),result={timestamp:updated?.timestamp||0,updates:new Map(feeds.flatMap(f=>[...f.updates])),vehicles:feeds.flatMap(f=>f.vehicles),alerts:feeds.flatMap(f=>f.alerts),alertTimestamp:Math.max(0,...feeds.filter(f=>f.alerts.length).map(f=>f.timestamp)),sources:{[provider.id]:feeds.some(f=>f.timestamp)},available:feeds.some(f=>f.timestamp)};
 return result;
}
