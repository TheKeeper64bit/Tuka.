async function validateSession() {
  try {
    const response = await fetch('/auth/session', {cache:'no-store', credentials:'same-origin'});
    const state = await response.json();
    if (!state.authenticated) location.replace('/login');
  } catch { /* Connection indicators handle temporary network failures. */ }
}
window.addEventListener('pageshow', event => { if (event.persisted) validateSession(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) validateSession(); });
setInterval(() => { if (!document.hidden) validateSession(); }, 60000);
document.querySelector('#tuka-signout').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  try {
    const response = await fetch('/auth/logout', {method:'POST', credentials:'same-origin'});
    if (!response.ok) throw new Error('Sign out failed');
    if ('caches' in window) await Promise.all((await caches.keys()).filter(key => /^tuka-v/.test(key)).map(key => caches.delete(key)));
    location.replace('/login');
  } catch {
    button.disabled = false;
    alert('Could not sign out. Check your connection and try again.');
  }
});
