// Quiet street palette and reusable map overlays; MapLibre owns marker positioning.
export function polishMap(map,dark=false){
  const p=dark?{ground:'#0b1d2d',water:'#12394b',green:'#193c36',building:'#263e50',residential:'#112637',institution:'#1c3147',road:'#344e60',casing:'#142737',boundary:'#425b6b',label:'#cfdeea',minor:'#a2b8c9',halo:'#0b1d2d'}:{ground:'#f3f6f8',water:'#c7e0ee',green:'#e0ece4',building:'#dfe5e9',residential:'#eef2f5',institution:'#e7edf3',road:'#ffffff',casing:'#d7dfe6',boundary:'#bbc7d0',label:'#435c6e',minor:'#687d8c',halo:'#f8fafc'};
  for(const layer of map.getStyle().layers||[]){
    const id=layer.id;
    // Theme the basemap only: route colours, stop pins and ride overlays retain identity.
    if(/^(station-network|reachable-stops|destination-stop|selected-stop|stops|route|journey|selected-route)(-|$)/.test(id))continue;
    if(layer.type==='background')map.setPaintProperty(id,'background-color',p.ground);
    if(layer.type==='fill'){
      const color=/water/.test(id)?p.water:/park|wood|grass|cemetery|pitch|landcover/.test(id)?p.green:/building/.test(id)?p.building:/residential/.test(id)?p.residential:/hospital|school/.test(id)?p.institution:p.ground;
      map.setPaintProperty(id,'fill-color',color);
    }
    if(layer.type==='fill-extrusion')map.setPaintProperty(id,'fill-extrusion-color',p.building);
    if(layer.type==='line'){
      if(/waterway/.test(id))map.setPaintProperty(id,'line-color',p.water);
      else if(/^(road|bridge|tunnel)_/.test(id))map.setPaintProperty(id,'line-color',/casing|rail|pattern/.test(id)?p.casing:p.road);
      else if(/boundary|building/.test(id))map.setPaintProperty(id,'line-color',p.boundary);
    }
    const label=layer.layout?.['text-field'];
    if(layer.type==='symbol'&&label){
      if(JSON.stringify(label).includes('name'))map.setLayoutProperty(id,'text-field',['coalesce',['get','name:en'],['get','name:latin'],['get','name']]);
      map.setPaintProperty(id,'text-color',/road|waterway/.test(id)?p.minor:p.label);
      map.setPaintProperty(id,'text-halo-color',p.halo);
    }
  }
}
export function routeGeometry(db,trip,stops){
  const byId=new Map(db.stops.map(s=>[s.id,s]));
  const scheduled=(db.times.get(trip?.trip_id)||[]).map(s=>s.stop_id);
  const outline=ids=>ids.map(id=>byId.get(id)).filter(Boolean).map(s=>[s.lon,s.lat]).filter(valid);
  const reference=outline(scheduled.length?scheduled:stops||[]);
  const shaped=(db.shapes.get(trip?.shape_id)||[]).map(p=>p.slice(0,2));
  // A shape can be syntactically valid yet belong to another place. The 47a П
  // feed included a 1,096 km excursion while its actual stops span about 13 km.
  // Reject the whole shape; removing foreign points would invent connecting roads.
  if(shaped.length>1&&shaped.every(valid)&&credibleShape(shaped,reference))return {points:shaped,approximate:false};
  return {points:stops?outline(stops):reference,approximate:true,reason:shaped.length>1?'invalid-shape':'missing-shape'};
}
function valid(p){return p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;}
function credibleShape(points,stops){
  if(stops.length<2)return false;
  const xs=stops.map(p=>p[0]),ys=stops.map(p=>p[1]),south=Math.min(...ys),north=Math.max(...ys);
  const longitudeMeters=Math.max(1,111000*Math.cos((south+north)/2*Math.PI/180));
  const west=Math.min(...xs)-5000/longitudeMeters,east=Math.max(...xs)+5000/longitudeMeters;
  // Generous padding allows normal street detours beyond the outermost stops.
  if(points.some(p=>p[0]<west||p[0]>east||p[1]<south-5000/111000||p[1]>north+5000/111000))return false;
  const length=path=>path.slice(1).reduce((sum,p,i)=>sum+Math.hypot((p[0]-path[i][0])*longitudeMeters,(p[1]-path[i][1])*111000),0);
  return length(points)<=length(stops)*4+5000;
}
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
    map.addLayer({id:'reachable-stops',type:'circle',source:'reachable-stops',paint:{'circle-radius':['interpolate',['linear'],['zoom'],9,3,14,4,17,6],'circle-color':'#fff','circle-stroke-color':'#0865d6','circle-stroke-width':2}});
    map.addLayer({id:'destination-stop',type:'circle',source:'reachable-stops',filter:['==',['get','id'],target||''],paint:{'circle-radius':9,'circle-color':'#cf3b79','circle-stroke-color':'#fff','circle-stroke-width':3}});
  }
  map.setFilter('destination-stop',['==',['get','id'],target||'']);
}

export function stopPinLayer(map,id,source,filter,selected=false){
 if(map.addImage&&!map.hasImage('tuka-stop-pin')){
  const canvas=document.createElement('canvas');canvas.width=48;canvas.height=64;const c=canvas.getContext('2d');
  c.beginPath();c.moveTo(24,60);c.bezierCurveTo(18,49,5,36,5,23);c.arc(24,23,19,Math.PI,0);c.bezierCurveTo(43,36,30,49,24,60);c.closePath();c.fillStyle='#0865d6';c.fill();c.lineWidth=3;c.strokeStyle='#fff';c.stroke();c.beginPath();c.arc(24,23,7,0,Math.PI*2);c.fillStyle='#fff';c.fill();map.addImage('tuka-stop-pin',c.getImageData(0,0,48,64),{pixelRatio:2});
 }
 return map.addImage?{id,type:'symbol',source,minzoom:selected?0:11.5,filter,layout:{'icon-image':'tuka-stop-pin','icon-anchor':'bottom','icon-allow-overlap':selected,'icon-ignore-placement':selected,'icon-padding':2,'icon-size':selected?1.15:['interpolate',['linear'],['zoom'],11.5,.5,14,.7,17,.9]}}:{id,type:'circle',source,minzoom:selected?0:11.5,filter,paint:{'circle-radius':selected?9:4,'circle-color':'#0865d6','circle-stroke-color':'#fff','circle-stroke-width':2}};
}
