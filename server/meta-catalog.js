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
    capabilities: ['scheduled'],
    provider: 'MBTA official GTFS',
    feedUrl: 'https://cdn.mbta.com/MBTA_GTFS.zip',
    status: 'gtfs',
    description: 'A second-city GTFS adapter with scheduled service and a separate local timezone.',
  },
];

export function cityById(id) {
  return CITY_CATALOG.find(city => city.id === id) || CITY_CATALOG[0];
}

export function publicCities() {
  return CITY_CATALOG.map(({feedUrl, ...city}) => ({...city}));
}
