import {CITY_PROVIDERS} from '../dist/city-providers.js';
// Public profiles come from the same registry used by the passenger app.
export const CITY_CATALOG=Object.values(CITY_PROVIDERS).map(city=>({
 id:city.id,name:city.name,country:city.country,timezone:city.timezone,center:city.center,
 capabilities:['scheduled',...(city.capabilities.includes('predicted')?['realtime']:[]),...(city.capabilities.includes('vehicles')?['vehicles']:[]),'alerts',...(city.id==='tilburg'?['operator-notices']:[])],
 provider:city.label,feedUrl:city.gtfsUrl,status:'pilot',coverage:['bus'],
 description:`${city.label} bus routes and timetables, with live updates where the provider supplies matching data.${city.id==='tilburg'?' Official operator notices are available.':''}`,
}));
export const cityById=id=>CITY_CATALOG.find(city=>city.id===id)||CITY_CATALOG[0];
export const publicCities=()=>CITY_CATALOG.map(({feedUrl,...city})=>city);
