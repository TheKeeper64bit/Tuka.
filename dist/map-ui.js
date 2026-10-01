// Quiet street palette and reusable map overlays; MapLibre owns marker positioning.
export function polishMap(map){
  for(const layer of map.getStyle().layers||[]){
    const id=layer.id;
    if(layer.type==='background')map.setPaintProperty(id,'background-color','#f3f6f8');
    if(layer.type==='fill'){
      const color=/water/.test(id)?'#c7e0ee':/park|wood|grass|cemetery|pitch/.test(id)?'#e0ece4':/building/.test(id)?'#dfe5e9':/residential/.test(id)?'#eef2f5':/hospital|school/.test(id)?'#e7edf3':null;
      if(color)map.setPaintProperty(id,'fill-color',color);
    }
    if(layer.type==='line'){
      if(/waterway/.test(id))map.setPaintProperty(id,'line-color','#c7e0ee');
      else if(/^(road|bridge|tunnel)_/.test(id)&&!/rail|pattern/.test(id))map.setPaintProperty(id,'line-color',/casing/.test(id)?'#d7dfe6':'#ffffff');
      else if(/boundary/.test(id))map.setPaintProperty(id,'line-color','#bbc7d0');
    }
    const label=layer.layout?.['text-field'];
    if(layer.type==='symbol'&&label&&JSON.stringify(label).includes('name')){
      map.setLayoutProperty(id,'text-field',['coalesce',['get','name:en'],['get','name:latin'],['get','name']]);
      map.setPaintProperty(id,'text-color',/road|waterway/.test(id)?'#687d8c':'#435c6e');
      map.setPaintProperty(id,'text-halo-color','#f8fafc');
    }
  }
}
export function routeGeometry(db,trip,stops){
  const shaped=(db.shapes.get(trip?.shape_id)||[]).map(p=>p.slice(0,2)).filter(valid);
  if(shaped.length>1)return {points:shaped,approximate:false};
  const byId=new Map(db.stops.map(s=>[s.id,s]));
  const points=(stops||(db.times.get(trip?.trip_id)||[]).map(s=>s.stop_id)).map(id=>byId.get(id)).filter(Boolean).map(s=>[s.lon,s.lat]).filter(valid);
  return {points,approximate:true};
}
function valid(p){return p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]);}
export function routeOverlay(map,id,points){
  const data={type:'FeatureCollection',features:points.length>1?[{type:'Feature',geometry:{type:'LineString',coordinates:points},properties:{}}]:[]};
  if(map.getSource(id)){map.getSource(id).setData(data);return;}
  map.addSource(id,{type:'geojson',data});
  const before=map.getLayer('stops')?'stops':(map.getStyle().layers||[]).find(l=>l.type==='symbol')?.id;
  map.addLayer({id:id+'-halo',type:'line',source:id,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':8,'line-opacity':.95}},before);
  map.addLayer({id:id+'-line',type:'line',source:id,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#1768df','line-width':4,'line-opacity':.9}},before);
}
export function syncMarkers(existing,vehicles,create,update){
  const retained=new Map();
  for(const v of vehicles){const key=v.label||v.id;let entry=existing.get(key);if(!entry)entry=create(v);update(entry,v);retained.set(key,entry);}
  for(const [key,entry] of existing)if(!retained.has(key))entry.marker.remove();
  return retained;
}
export function networkOverlay(map,patterns,stops,target){
  const data={type:'FeatureCollection',features:patterns.filter(p=>p.points.length>1).map(p=>({type:'Feature',properties:{routeId:p.route.route_id,color:p.color},geometry:{type:'LineString',coordinates:p.points}}))};
  if(map.getSource('station-network'))map.getSource('station-network').setData(data);
  else{
    map.addSource('station-network',{type:'geojson',data});
    const before=map.getLayer('stops')?'stops':undefined;
    map.addLayer({id:'station-network-halo',type:'line',source:'station-network',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':6,'line-opacity':.65}},before);
    map.addLayer({id:'station-network-lines',type:'line',source:'station-network',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':3,'line-opacity':.8}},before);
  }
  const points={type:'FeatureCollection',features:stops.map(x=>({type:'Feature',properties:{id:x.stop.id},geometry:{type:'Point',coordinates:[x.stop.lon,x.stop.lat]}}))};
  if(map.getSource('reachable-stops'))map.getSource('reachable-stops').setData(points);
  else{
    map.addSource('reachable-stops',{type:'geojson',data:points});
    map.addLayer({id:'reachable-stops',type:'circle',source:'reachable-stops',paint:{'circle-radius':['interpolate',['linear'],['zoom'],10,2.5,14,4,17,6],'circle-color':'#fff','circle-stroke-color':'#245474','circle-stroke-width':1.5}});
    map.addLayer({id:'destination-stop',type:'circle',source:'reachable-stops',filter:['==',['get','id'],target||''],paint:{'circle-radius':9,'circle-color':'#cf3b79','circle-stroke-color':'#fff','circle-stroke-width':3}});
  }
  map.setFilter('destination-stop',['==',['get','id'],target||'']);
}
