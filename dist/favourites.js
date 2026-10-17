// Device-local saved stops. null routes means all lines, including future ones.
export function readFavourites(storage) {
  try {
    const value = JSON.parse(storage.getItem('tuka-saved') || '[]');
    const entries = Array.isArray(value) ? value.map(stopId => ({stopId, routeIds:null, targetStopId:null})) : value?.version === 2 ? value.stops : [];
    return new Map((Array.isArray(entries) ? entries : []).filter(x => x && typeof x.stopId === 'string' && (x.routeIds === null || Array.isArray(x.routeIds))).map(x => [x.stopId, {
      routeIds:x.routeIds === null ? null : [...new Set(x.routeIds.filter(id => typeof id === 'string'))],
      targetStopId:typeof x.targetStopId === 'string' ? x.targetStopId : null,
    }]));
  } catch { return new Map(); }
}
export function writeFavourites(storage, saved) {
  storage.setItem('tuka-saved', JSON.stringify({version:2, stops:[...saved].map(([stopId, filters]) => ({stopId, ...filters}))}));
}
export function savedSelection(routeIds, allRoutes, targetStopId) {
  const chosen = [...routeIds].sort(), all = [...allRoutes].sort();
  return {routeIds:!targetStopId && JSON.stringify(chosen) === JSON.stringify(all) ? null : chosen, targetStopId:targetStopId || null};
}
export function sameSelection(a, b) {
  return !!a && a.targetStopId === b.targetStopId && JSON.stringify(a.routeIds === null ? null : [...a.routeIds].sort()) === JSON.stringify(b.routeIds === null ? null : [...b.routeIds].sort());
}
export function savedRouteMatches(filters, routeId) {
  return !filters || filters.routeIds === null || filters.routeIds.includes(routeId);
}
