const letters={'а':'a','б':'b','в':'v','г':'g','д':'d','ѓ':'gj','е':'e','ж':'zh','з':'z','ѕ':'dz','и':'i','ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o','п':'p','р':'r','с':'s','т':'t','ќ':'kj','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','џ':'dzh','ш':'sh'};
const norm=s=>String(s||'').toLowerCase().split('').map(c=>letters[c]||c).join('').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
export function placeType(p) { const value=p.osm_value||p.type||'';return ({hotel:'Hotel',hostel:'Hostel',square:'Square',pedestrian:'Pedestrian area',bus_stop:'Bus stop',restaurant:'Restaurant',cafe:'Café',museum:'Museum',park:'Park',street:'Street',house:'Address'})[value]|| (p.street?'Address':value?value.replaceAll('_',' '):'Place'); }
export function rankPlaces(places,query) {
  const main=norm(query.split(',')[0]),full=norm(query),seen=new Set();
  return places.filter(p=>{const key=`${p.lat.toFixed(5)}|${p.lon.toFixed(5)}|${norm(p.name)}`;if(seen.has(key))return false;seen.add(key);return true;}).map(p=>{
    const n=norm(p.name),address=norm([p.street,p.house].filter(Boolean).join(' '));
    const exact=n===main||n===full||address===main;
    const score=exact?0:n.startsWith(main)?1:n.includes(main)?2:3;
    return {...p,exact,score};
  }).sort((a,b)=>a.score-b.score||((a.type==='Hotel'||a.type==='Hostel')?1:0)-((b.type==='Hotel'||b.type==='Hostel')?1:0));
}
