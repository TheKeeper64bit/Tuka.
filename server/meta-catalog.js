import {CITY_PROVIDERS} from '../dist/city-providers.js';
// Public profiles come from the same registry used by the passenger app.
export const CITY_CATALOG=Object.values(CITY_PROVIDERS).map(city=>({
 id:city.id,name:city.name,country:city.country,timezone:city.timezone,center:city.center,
 capabilities:['scheduled',...(city.capabilities.includes('predicted')?['realtime']:[]),...(city.capabilities.includes('vehicles')?['vehicles']:[]),'alerts','news'],
 provider:city.label,feedUrl:city.gtfsUrl,status:'live',coverage:['bus'],
 description:city.id==='norfolk'?'Hampton Roads bus routes, predicted departures and official HRT news. Vehicle positions are not published by this feed.':`${city.label} bus routes, timetables, live updates where available, and local transit news.`,
}));
export const cityById=id=>CITY_CATALOG.find(city=>city.id===id)||CITY_CATALOG[0];
export const publicCities=()=>CITY_CATALOG.map(({feedUrl,...city})=>city);
