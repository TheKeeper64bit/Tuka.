// The Pages build supplies its public read API; the private app stays same-origin.
export const API_BASE = '';
export function apiURL(path) {
  const endpoint=String(path).replace(/^\.\//,'/');
  if(!endpoint.startsWith('/api/'))throw new TypeError('Invalid Tuka API endpoint');
  return API_BASE ? API_BASE.replace(/\/$/,'')+endpoint : endpoint;
}
export const apiCredentials=()=>API_BASE?'omit':'same-origin';
