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

  tilburg: Object.freeze({
    id:'tilburg',name:'Tilburg',country:'Netherlands',label:'Arriva / Bravo · OVapi',timezone:'Europe/Amsterdam',
    center:[5.083,51.5606],bounds:[4.3,51.1,6.1,52.1],detectionBounds:[5.00,51.49,5.16,51.63],refreshMs:30000,
    capabilities:['scheduled','predicted','vehicles','alerts'],scheduleAsset:'./tilburg-network.bin',
    gtfsUrl:'https://gtfs.ovapi.nl/nl/gtfs-nl.zip',realtime:liveFeeds('tilburg'),
    news:{label:'Arriva / Bravo',url:'https://www.bravo.info/reizen/omleidingen-en-storingen-bus',hosts:['www.bravo.info','www.arriva.nl','arriva.nl','bravo.info']},
  }),
});

// Runtime profiles share one registry even when cached modules have different URLs.
const imported=globalThis[Symbol.for('tuka.imported-providers')]??=new Map();
export const providers=()=>[...Object.values(CITY_PROVIDERS),...imported.values()];
export const hasProvider=id=>Object.hasOwn(CITY_PROVIDERS,id)||imported.has(id);
export function registerProvider(profile){
 if(!/^gtfs-[a-f0-9]{64}$/.test(profile?.id)||!profile.imported||!Array.isArray(profile.bounds)||profile.bounds.length!==4||!profile.bounds.every(Number.isFinite))throw Error('Invalid imported network profile');
 new Intl.DateTimeFormat('en',{timeZone:profile.timezone});
 imported.set(profile.id,Object.freeze({...profile}));return profile;
}
export function unregisterProvider(id){imported.delete(id);}
export function providerFor(cityId = 'skopje') {
  return CITY_PROVIDERS[cityId] || imported.get(cityId) || CITY_PROVIDERS.skopje;
}

// Unknown positions never silently choose another city's transit system.
export function cityAtLocation(point){
 if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lon))return null;
 return providers().sort((a,b)=>Number(b.imported||false)-Number(a.imported||false)).find(p=>{const [w,s,e,n]=p.detectionBounds||p.bounds;return point.lon>=w&&point.lon<=e&&point.lat>=s&&point.lat<=n;})||null;
}
export function officialNewsURL(value,cityId='skopje'){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(providerFor(cityId).news?.hosts||[]).includes(u.hostname)?u.href:null;}catch{return null;}
}

// Startup never downloads an arbitrary city's timetable before GPS resolves.
export async function locateCity(geolocation){
 if(!geolocation)return {city:null,position:null,reason:'unavailable'};
 return new Promise(resolve=>geolocation.getCurrentPosition(fix=>{
  const position={lat:fix.coords.latitude,lon:fix.coords.longitude};
  resolve({city:cityAtLocation(position),position,reason:'located'});
 },()=>resolve({city:null,position:null,reason:'unavailable'}),{enableHighAccuracy:false,timeout:8000,maximumAge:60000}));
}
