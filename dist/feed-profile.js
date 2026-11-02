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
 return profile;
}
