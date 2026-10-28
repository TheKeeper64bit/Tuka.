// City/provider registry for the Meta hackathon build.
// Keep provider-specific details here so the shared UI never guesses a city's
// timezone, coverage, or live-data capabilities.
export const CITY_CATALOG = [
  {
    id: 'skopje',
    name: 'Skopje',
    country: 'North Macedonia',
    timezone: 'Europe/Skopje',
    center: [21.4316, 41.9981],
    capabilities: ['scheduled', 'realtime', 'alerts'],
    provider: 'JSP / Modeshift',
    status: 'live',
    description: 'Live JSP departures, vehicle positions, service notices, and walking-aware journeys.',
  },
  {
    id: 'boston',
    name: 'Boston',
    country: 'United States',
    timezone: 'America/New_York',
    center: [-71.0589, 42.3601],
    capabilities: ['scheduled', 'realtime', 'alerts'],
    provider: 'MBTA official GTFS + V3 API',
    feedUrl: 'https://cdn.mbta.com/MBTA_GTFS.zip',
    status: 'live',
    coverage: ['bus', 'shuttle'],
    description: 'Boston’s official bus and shuttle schedule, with live MBTA predictions and vehicle positions when available.',
  },
];

export function cityById(id) {
  return CITY_CATALOG.find(city => city.id === id) || CITY_CATALOG[0];
}

export function publicCities() {
  return CITY_CATALOG.map(({feedUrl, ...city}) => ({...city}));
}
