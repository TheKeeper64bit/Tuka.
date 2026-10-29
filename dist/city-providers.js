// Shared provider metadata. Provider-specific URLs and capabilities live here;
// the schedule, planner, and UI can consume the same normalized city profile.
export const CITY_PROVIDERS = Object.freeze({
  skopje: Object.freeze({
    id: 'skopje', timezone: 'Europe/Skopje',
    gtfsUrl: 'https://www.modeshift.app/api/v1/9814b106-2afe-47c8-919b-bdec6a5e521e/transport/gtfs/gtfs.zip',
    realtime: Object.freeze({kind: 'gtfsrt', url: 'https://www.modeshift.app/api/v1/9814b106-2afe-47c8-919b-bdec6a5e521e/transport/gtfsrt/tripupdates.pb'}),
  }),
  boston: Object.freeze({
    id: 'boston', timezone: 'America/New_York',
    gtfsUrl: 'https://cdn.mbta.com/MBTA_GTFS.zip',
    realtime: Object.freeze({kind: 'mbta-v3', url: 'https://api-v3.mbta.com'}),
  }),
});

export function providerFor(cityId = 'skopje') {
  return CITY_PROVIDERS[cityId] || CITY_PROVIDERS.skopje;
}
