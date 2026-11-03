import {credibleShape} from './map-ui.js?v=22';
import {normalizeGTFS,geolocatedStops} from './gtfs.js?v=2';
export const table=(tables,name)=>tables[name]||tables[name+'.txt']||[];
export function inspectFeed(tables,id,name=''){
 for(const [name,key] of [['stops','stop_id'],['routes','route_id'],['trips','trip_id']]){
  const seen=new Set();for(const row of table(tables,name)){if(!row[key]||seen.has(row[key]))throw Error('Missing or duplicate '+key+' in '+name+'.txt');seen.add(row[key]);}
 }
 const agencies=table(tables,'agency'),zones=[...new Set(agencies.map(a=>a.agency_timezone).filter(Boolean))];
 if(zones.length!==1)throw Error('GTFS needs one valid agency time zone. Split feeds with different agency time zones before importing.');
 new Intl.DateTimeFormat('en',{timeZone:zones[0]});
 const points=geolocatedStops(table(tables,'stops'));
 if(points.length<2)throw Error('The feed needs at least two stops with valid coordinates.');
 let w=180,e=-180,s=90,n=-90;for(const p of points){w=Math.min(w,+p.stop_lon);e=Math.max(e,+p.stop_lon);s=Math.min(s,+p.stop_lat);n=Math.max(n,+p.stop_lat);}
 const pad=.02,bounds=[Math.max(-180,w-pad),Math.max(-90,s-pad),Math.min(180,e+pad),Math.min(90,n+pad)];
 const agencyNames=[...new Set(agencies.map(a=>a.agency_name).filter(Boolean))];
 const profile={id,imported:true,name:String(name.trim()||table(tables,'feed_info')[0]?.feed_publisher_name||agencyNames[0]||'Imported network').slice(0,80),label:(agencyNames.length>2?agencyNames.slice(0,2).join(' / ')+' + '+(agencyNames.length-2)+' agencies':agencyNames.join(' / ')).slice(0,180)||'GTFS timetable',timezone:zones[0],center:[(w+e)/2,(s+n)/2],bounds,refreshMs:30000,capabilities:['scheduled'],agencies:agencyNames,warnings:[]};
 const source=table(tables,'feed_info')[0]?.feed_publisher_url||agencies[0]?.agency_url;
 try{const url=new URL(source);if(url.protocol==='https:'&&!url.username&&!url.password)profile.sourceURL=url.href;}catch{}
 const db=normalizeGTFS(tables,id,null,profile);
 if(!db.trips.size)throw Error('No usable trips remain. Check stop references, stop sequences and timetable times.');
 const services=new Set([...db.calendar.map(r=>r.service_id),...db.exceptions.filter(r=>r.exception_type==='1').map(r=>r.service_id)]);if(![...db.trips.values()].some(t=>services.has(t.service_id)))throw Error('No trip matches a published service calendar.');
 const timed=[...db.tripBounds.values()].filter(p=>p.every(Number.isFinite));if(!timed.length)throw Error('The feed has no timed journeys.');
 if(db.trips.size<table(tables,'trips').length)profile.warnings.push('Some trips were excluded because their stops or sequences are invalid.');
 if(!db.shapes.size)profile.warnings.push('No published shapes: the map will show approximate connections between stops.');
 if(table(tables,'frequencies').length)profile.warnings.push('Frequency-based departures are estimates, not live predictions.');
 if(table(tables,'stop_times').some(p=>!p.arrival_time&&!p.departure_time))profile.warnings.push('Intermediate stop times are interpolated between published timepoints.');
 profile.summary={stops:db.byStop.size,routes:db.routes.size,trips:db.trips.size,shapes:db.shapes.size,agencies:agencyNames.length,modes:[...new Set([...db.routes.values()].map(r=>String(r.route_type||'3')))],feedStart:db.info.feed_start_date||'',feedEnd:db.info.feed_end_date||[...db.calendar.map(r=>r.end_date),...db.exceptions.filter(r=>r.exception_type==='1').map(r=>r.date)].filter(Boolean).sort().at(-1)||''};
 profile.diagnostics=diagnoseFeed(tables,db,profile);
 return profile;
}

// Count every finding but send at most three representative IDs per category.
function diagnoseFeed(tables,db,profile){
 const findings=new Map(),version=1;
 const add=(code,severity,id)=>{
  if(!findings.has(code))findings.set(code,{code,severity,count:0,ids:[]});
  const row=findings.get(code);row.count++;
  if(typeof id==='string'&&/^[\p{L}\p{N}_.:@/+ -]{1,60}$/u.test(id)&&row.ids.length<3&&!row.ids.includes(id))row.ids.push(id);
 };
 const required={agency:['agency_name','agency_url','agency_timezone'],stops:['stop_id'],routes:['route_id','route_type'],trips:['route_id','service_id','trip_id'],stop_times:['trip_id','stop_id','stop_sequence']};
 for(const [name,keys] of Object.entries(required)){
  if(!table(tables,name).length)add('required_field','warning',name);
  for(const row of table(tables,name))if(keys.some(key=>!String(row[key]??'').trim()))add('required_field','warning',row.trip_id||row.stop_id||row.route_id||name);
 }
 const ids=name=>new Set(table(tables,name).map(r=>r[name.slice(0,-1)+'_id']));
 const stops=ids('stops'),routes=ids('routes'),trips=ids('trips');
 const agencies=new Set(table(tables,'agency').map(a=>a.agency_id).filter(Boolean));
 const services=new Set([...table(tables,'calendar'),...table(tables,'calendar_dates').filter(r=>r.exception_type==='1')].map(r=>r.service_id));
 for(const r of table(tables,'routes'))if(r.agency_id&&!agencies.has(r.agency_id)||!r.agency_id&&agencies.size>1)add('agency_reference','warning',r.route_id);
 const directions=new Map(),shapeSamples=new Map();
 for(const t of table(tables,'trips')){
  if(!routes.has(t.route_id)||!services.has(t.service_id))add('trip_reference','warning',t.trip_id);
  if(!db.trips.has(t.trip_id))add('excluded_trip','warning',t.trip_id);
  if(t.direction_id&&t.direction_id!=='0'&&t.direction_id!=='1')add('direction','warning',t.route_id);
  if(t.trip_headsign&&['0','1'].includes(t.direction_id)){
   const key=JSON.stringify([t.route_id,t.trip_headsign]),prior=directions.get(key);
   if(prior!=null&&prior!==t.direction_id)add('direction','warning',t.route_id);
   directions.set(key,t.direction_id);
  }
  if(t.shape_id&&!db.shapes.has(t.shape_id))add('shape_reference','warning',t.trip_id);
  if(t.shape_id&&!shapeSamples.has(t.shape_id)&&shapeSamples.size<120)shapeSamples.set(t.shape_id,t.trip_id);
 }
 for(const call of table(tables,'stop_times'))if(!trips.has(call.trip_id)||!stops.has(call.stop_id))add('stop_reference','warning',call.trip_id);
 const validDate=value=>{
  if(!/^\d{8}$/.test(value||''))return false;
  const iso=value.replace(/^(....)(..)(..)$/,'$1-$2-$3'),date=new Date(iso+'T00:00:00Z');
  return Number.isFinite(+date)&&date.toISOString().startsWith(iso);
 };
 for(const c of table(tables,'calendar'))if(!validDate(c.start_date)||!validDate(c.end_date)||c.end_date<c.start_date)add('calendar','warning',c.service_id);
 for(const c of table(tables,'calendar_dates'))if(!validDate(c.date)||!['1','2'].includes(String(c.exception_type)))add('calendar','warning',c.service_id);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:profile.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts().filter(p=>['year','month','day'].includes(p.type));
 const date=['year','month','day'].map(type=>today.find(p=>p.type===type).value).join('');
 if(validDate(profile.summary.feedEnd)&&profile.summary.feedEnd<date)add('expired_calendar','warning');
 const stopIndex=new Map(db.stops.map(stop=>[stop.id,stop])),duplicates=new Set();
 for(const stop of db.stops){
  const key=JSON.stringify([stop.stop_name||stop.name,stop.lat.toFixed(5),stop.lon.toFixed(5)]);
  if(duplicates.has(key))add('duplicate_stop','warning',stop.id);
  duplicates.add(key);
 }
 let geometrySamples=0,geometryWork=0;
 for(const [shapeId,tripId] of shapeSamples){
  const shape=db.shapes.get(shapeId),calls=db.times.get(tripId)||[];
  if(!shape||shape.length>5000||calls.length<2||calls.length>500)continue;
  const work=shape.length*calls.length;if(geometryWork+work>2000000)continue;
  geometryWork+=work;geometrySamples++;
  const points=calls.map(call=>stopIndex.get(call.stop_id)).filter(Boolean).map(stop=>[stop.lon,stop.lat]);
  if(points.length>1&&!credibleShape(shape.map(p=>p.slice(0,2)),points))add('suspicious_shape','warning',shapeId);
 }
 if(!db.shapes.size)add('no_shapes','unsupported');
 for(const name of tables.unsupportedTables||[])add('unsupported','unsupported',name);
 return {version,critical:0,warnings:[...findings.values()].filter(f=>f.severity==='warning').reduce((sum,f)=>sum+f.count,0),afterMidnight:[...db.tripBounds.values()].some(([,end])=>end>=86400),geometrySamples,findings:[...findings.values()]};
}
