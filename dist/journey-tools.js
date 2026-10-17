import {preferences} from './planner.js?v=24';

export function place(value){
  if(!value)return null;
  const coordinate=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(+v);
  if(!coordinate(value.lat)||!coordinate(value.lon))return null;
  const lat=+value.lat,lon=+value.lon;
  // Include the suburban JSP network, which extends beyond the city centre.
  if(lat<41.7||lat>42.3||lon<21||lon>22)return null;
  return {lat,lon,name:String(value.name||'Pinned location').slice(0,100)};
}
export function readPlaces(storage){try{const data=JSON.parse(storage.getItem('tuka-places')||'{}');return {home:place(data.home),work:place(data.work)};}catch{return {};}}
export function writePlace(storage,key,value){
  const point=place(value);
  if(!['home','work'].includes(key)||!point)throw new RangeError('Invalid saved place');
  const places=readPlaces(storage);places[key]=point;storage.setItem('tuka-places',JSON.stringify(places));return places;
}
export function sharedJourney(base,from,to,options={}){
  const a=place(from),b=place(to);if(!a||!b)return null;
  const url=new URL('/',base),p=preferences(options);
  for(const [key,value] of Object.entries({from:`${a.lat.toFixed(5)},${a.lon.toFixed(5)}`,to:`${b.lat.toFixed(5)},${b.lon.toFixed(5)}`,fromName:a.name,toName:b.name,preference:p.preference,speed:p.walkingSpeed,transfer:p.minTransfer}))url.searchParams.set(key,value);
  return url.href;
}
export function readShared(url){
  try{const p=new URL(url).searchParams,stop=p.get('stop');if(stop&&stop.length<=100)return {stop};
    const point=key=>{const pair=(p.get(key)||'').split(',');return pair.length===2?place({lat:pair[0],lon:pair[1],name:p.get(key+'Name')}):null;};
    const origin=point('from'),destination=point('to');
    return origin&&destination?{origin,destination,options:preferences({preference:p.get('preference'),walkingSpeed:p.get('speed')??4.5,minTransfer:p.get('transfer')??3})}:null;
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
