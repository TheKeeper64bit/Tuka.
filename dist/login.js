const requestForm = document.querySelector('#request-form');
const codeForm = document.querySelector('#code-form');
const status = document.querySelector('#status');
const retry = document.querySelector('#retry-request');
let expiresAt = 0;
async function api(path, input) {
  const response = await fetch(path, {method:input ? 'POST' : 'GET', credentials:'same-origin', cache:'no-store', headers:input ? {'Content-Type':'application/json'} : {}, body:input ? JSON.stringify(input) : undefined});
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Please try again.');
  return value;
}
function showPending(data, focus = false) {
  requestForm.hidden = true; codeForm.hidden = false; retry.hidden = true;
  document.querySelector('#reference').textContent = data.reference;
  expiresAt = data.expiresAt;
  updateTime();
  if (focus) document.querySelector('#code').focus();
}
function updateTime() {
  if (!expiresAt) return;
  const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  document.querySelector('#expiry').textContent = seconds ? `Code expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')}.` : 'This code has expired.';
  if (!seconds) { codeForm.hidden = true; retry.hidden = false; status.textContent = 'Request a new code to continue.'; }
}
async function submit(form, path, payload) {
  const button = form.querySelector('button'); button.disabled = true; status.textContent = '';
  try {
    const data = await api(path, payload);
    if (data.authenticated) location.replace('/');
    else if (data.pending) showPending(data, true);
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
}
requestForm.addEventListener('submit', event => { event.preventDefault(); submit(requestForm, '/auth/request', {label:document.querySelector('#label').value.trim()}); });
codeForm.addEventListener('submit', event => { event.preventDefault(); submit(codeForm, '/auth/verify', {code:document.querySelector('#code').value.trim()}); });
document.querySelector('#code').addEventListener('input', event => { event.target.value = event.target.value.replace(/[^0-9]/g,'').slice(0,8); });
retry.addEventListener('click', () => { expiresAt = 0; retry.hidden = true; requestForm.hidden = false; codeForm.hidden = true; status.textContent = ''; document.querySelector('#label').focus(); });
setInterval(updateTime, 1000);
// Remove the old offline app shell; authentication must always reach the server.
async function refreshAccess() {
  try {
    if ('caches' in window) await Promise.all((await caches.keys()).filter(k => /^tuka-v/.test(k)).map(k => caches.delete(k)));
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(r => r.update().catch(() => {})));
    }
    const data = await api('/auth/session');
    if (data.authenticated) location.replace('/');
    else if (data.pending) showPending(data);
  } catch { status.textContent = 'Connect to the internet to request or verify access.'; }
}
refreshAccess();
