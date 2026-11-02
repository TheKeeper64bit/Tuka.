import {providerFor} from './city-providers.js?v=2';
import {preferences} from './planner.js?v=25';

export function place(value,cityId='skopje'){
  if(!value)return null;
  const coordinate=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(+v);
  if(!coordinate(value.lat)||!coordinate(value.lon))return null;
  const lat=+value.lat,lon=+value.lon;
  // Include the suburban JSP network, which extends beyond the city centre.
  const bounds=cityId==='skopje'?[21,41.7,22,42.3]:providerFor(cityId).bounds;
  if(providerFor(cityId).id!==cityId||lat<bounds[1]||lat>bounds[3]||lon<bounds[0]||lon>bounds[2])return null;
  return {lat,lon,name:String(value.name||'Pinned location').slice(0,100)};
}
export function readPlaces(storage,cityId='skopje'){try{const data=JSON.parse(storage.getItem('tuka-places')||'{}');return {home:place(data.home,cityId),work:place(data.work,cityId)};}catch{return {};}}
export function writePlace(storage,key,value,cityId='skopje'){
  const point=place(value,cityId);
  if(!['home','work'].includes(key)||!point)throw new RangeError('Invalid saved place');
  const places=readPlaces(storage,cityId);places[key]=point;storage.setItem('tuka-places',JSON.stringify(places));return places;
}
export function sharedJourney(base,from,to,options={},cityId='skopje'){
  const a=place(from,cityId),b=place(to,cityId);if(!a||!b)return null;
  const url=new URL('./',base),p=preferences(options);
  for(const [key,value] of Object.entries({from:`${a.lat.toFixed(5)},${a.lon.toFixed(5)}`,to:`${b.lat.toFixed(5)},${b.lon.toFixed(5)}`,fromName:a.name,toName:b.name,preference:p.preference,speed:p.walkingSpeed,transfer:p.minTransfer}))url.searchParams.set(key,value);
  if(p.maxWalkingMinutes!==null)url.searchParams.set('walkLimit',p.maxWalkingMinutes);
  if(cityId!=='skopje')url.searchParams.set('city',cityId);
  return url.href;
}
export function readShared(url){
  try{const p=new URL(url).searchParams,stop=p.get('stop'),cityId=p.get('city')||'skopje';if(providerFor(cityId).id!==cityId)return null;if(stop&&stop.length<=100)return {stop,cityId};
    const point=key=>{const pair=(p.get(key)||'').split(',');return pair.length===2?place({lat:pair[0],lon:pair[1],name:p.get(key+'Name')},cityId):null;};
    const origin=point('from'),destination=point('to');
    return origin&&destination?{origin,destination,cityId,options:preferences({preference:p.get('preference'),walkingSpeed:p.get('speed')??4.5,minTransfer:p.get('transfer')??3,maxWalkingMinutes:p.get('walkLimit')})}:null;
  }catch{return null;}
}
export function wheelchairAccess(db,legs){
  const values=[];
  for(const leg of legs.filter(l=>l.type==='bus')){
    values.push(String(db.trips.get(leg.tripId)?.wheelchair_accessible||0));
    for(const stop of [leg.from,leg.to]){
      // A platform without a value may inherit its parent station's value.
      let value=stop.wheelchair_boarding;
      if((!value||value==='0')&&stop.parent_station)value=db.stops.find(s=>s.id===stop.parent_station)?.wheelchair_boarding;
      values.push(String(value||0));
    }
  }
  return values.includes('2')?'no':values.length&&values.every(v=>v==='1')?'yes':'unknown';
}
export const walkingDistance=leg=>leg.walkingMeters??leg.meters*1.3;
