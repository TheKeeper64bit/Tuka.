// Shared provider metadata. Provider-specific URLs and capabilities live here;
// the schedule, planner, and UI can consume the same normalized city profile.
const liveFeeds=(city,kinds=['trips','vehicles','alerts'])=>({kind:'gtfsrt',feeds:kinds.map(kind=>`/api/transit/${city}/${kind}`)});
export const CITY_PROVIDERS = Object.freeze({
  skopje: Object.freeze({
    id: 'skopje', name: 'Skopje', label: 'Modeshift', country:'North Macedonia', news:{label:'JSP',url:'https://skopjebus.mk/en/izvestuvanja/',hosts:['skopjebus.mk']}, timezone: 'Europe/Skopje',
    center:[21.4316,41.9981],bounds:[21.2,41.8,21.65,42.2],refreshMs:30000,capabilities:['scheduled','predicted','vehicles','alerts'],
    gtfsUrl: 'https://www.modeshift.app/api/v1/9814b106-2afe-47c8-919b-bdec6a5e521e/transport/gtfs/gtfs.zip',
    realtime: Object.freeze({kind: 'gtfsrt', url: 'https://www.modeshift.app/api/v1/9814b106-2afe-47c8-919b-bdec6a5e521e/transport/gtfsrt/tripupdates.pb'}),
  }),
  boston: Object.freeze({
    id: 'boston', name: 'Boston', label: 'MBTA', country:'United States', news:{label:'MBTA',url:'https://www.mbta.com/news',hosts:['www.mbta.com','mbta.com']}, timezone: 'America/New_York',
    center:[-71.0589,42.3601],bounds:[-72,41.5,-70,43],refreshMs:30000,capabilities:['scheduled','predicted','vehicles','alerts'],
    scheduleAsset:'./boston-network.bin',
    gtfsUrl: 'https://cdn.mbta.com/MBTA_GTFS.zip',
    realtime: Object.freeze({kind:'gtfsrt',feeds:['/api/transit/boston/trips','/api/transit/boston/vehicles','/api/transit/boston/alerts']}),
  }),
  minneapolis: Object.freeze({
    id:'minneapolis',name:'Minneapolis',country:'United States',label:'Metro Transit',timezone:'America/Chicago',
    center:[-93.265,44.9778],bounds:[-94.1,44.4,-92.5,45.5],refreshMs:30000,
    capabilities:['scheduled','predicted','vehicles','alerts'],scheduleAsset:'./minneapolis-network.bin',
    gtfsUrl:'https://svc.metrotransit.org/mtgtfs/gtfs.zip',realtime:liveFeeds('minneapolis'),
    news:{label:'Metro Transit',url:'https://www.metrotransit.org/news/',hosts:['www.metrotransit.org','metrotransit.org']},
  }),
  springfield: Object.freeze({
    id:'springfield',name:'Springfield, IL',country:'United States',label:'SMTD',timezone:'America/Chicago',
    center:[-89.6501,39.8017],bounds:[-90,39.5,-89.3,40.1],refreshMs:30000,
    capabilities:['scheduled','predicted','vehicles','alerts'],scheduleAsset:'./springfield-network.bin',
    gtfsUrl:'https://ride.smtd.org/gtfs/smtd_gtfs_feed.zip',realtime:liveFeeds('springfield'),
    news:{label:'SMTD',url:'https://www.smtd.org/about-smtd/news/',hosts:['www.smtd.org','smtd.org']},
  }),
  norfolk: Object.freeze({
    id:'norfolk',name:'Norfolk / Hampton Roads',country:'United States',label:'HRT',timezone:'America/New_York',
    center:[-76.2859,36.8508],bounds:[-76.8,36.5,-75.8,37.4],refreshMs:30000,
    capabilities:['scheduled','predicted','alerts'],scheduleAsset:'./norfolk-network.bin',
    gtfsUrl:'https://gtfs.gohrt.com/gtfs/google_transit.zip',realtime:liveFeeds('norfolk',['trips','alerts']),
    news:{label:'HRT',url:'https://gohrt.com/announcements/',hosts:['gohrt.com','www.gohrt.com']},
  }),
});

export function providerFor(cityId = 'skopje') {
  return CITY_PROVIDERS[cityId] || CITY_PROVIDERS.skopje;
}

// Unknown positions never silently choose another city's transit system.
export function cityAtLocation(point){
 if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lon))return null;
 return Object.values(CITY_PROVIDERS).find(p=>{const [w,s,e,n]=p.bounds;return point.lon>=w&&point.lon<=e&&point.lat>=s&&point.lat<=n;})||null;
}
export function officialNewsURL(value,cityId='skopje'){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&providerFor(cityId).news.hosts.includes(u.hostname)?u.href:null;}catch{return null;}
}
