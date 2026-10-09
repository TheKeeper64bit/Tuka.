const SESSION_COOKIE = '__Host-tuka_session';
const REQUEST_COOKIE = '__Host-tuka_request';
const CODE_SECONDS = 600;
const RESEND_SECONDS = 60;
const SESSION_SECONDS = 180 * 24 * 60 * 60;
const PUBLIC_PATHS = new Set(['/login', '/login.html', '/login.js', '/login.css', '/icon.svg', '/icon-192-blue.png', '/icon-512-blue.png', '/manifest.webmanifest', '/sw.js']);
const encoder = new TextEncoder();
const hex = bytes => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const hash = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
const keyFor = secret => crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign', 'verify']);
const mac = async (key, value) => hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
const fromHex = value => Uint8Array.from(value.match(/../g), x => parseInt(x, 16));
function randomCode() {
  const bytes = new Uint32Array(1);
  do { crypto.getRandomValues(bytes); } while (bytes[0] >= 4200000000);
  return String(bytes[0] % 100000000).padStart(8, '0');
}
function cookie(request, name) {
  const matches = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).filter(x => x.startsWith(name + '='));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}
const setCookie = (name, value, age) => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
function json(data, status = 200, cookies = []) {
  const headers = new Headers({'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Vary':'Cookie'});
  for (const value of cookies) headers.append('Set-Cookie', value);
  return Response.json(data, {status, headers});
}
async function body(request) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) throw new Error('bad-input');
  if (Number(request.headers.get('Content-Length')) > 1024) throw new Error('bad-input');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('bad-input');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1024) { await reader.cancel(); throw new Error('bad-input'); }
      chunks.push(value);
    }
    const data = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    const parsed = JSON.parse(new TextDecoder().decode(data));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bad-input');
    return parsed;
  } finally { reader.releaseLock(); }
}
async function session(request, db, now) {
  const token = cookie(request, SESSION_COOKIE);
  if (!token) return null;
  return db.prepare('SELECT id, label, expires_at FROM sessions WHERE token_hash = ? AND expires_at > ?').bind(await hash(token), now).first();
}
async function challenge(request, db, now) {
  const token = cookie(request, REQUEST_COOKIE);
  if (!token) return null;
  return db.prepare('SELECT id, code_mac, label, created_at, expires_at, attempts FROM challenges WHERE browser_hash = ? AND expires_at > ? AND delivered = 1').bind(await hash(token), now).first();
}
async function limit(db, key, maximum, seconds, now) {
  const window = Math.floor(now / seconds);
  const row = await db.prepare('INSERT INTO request_limits (key, hits, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET hits = hits + 1 RETURNING hits').bind(`${key}:${window}`, (window + 1) * seconds).first();
  return row.hits <= maximum;
}
const reference = id => id.slice(0, 8).toUpperCase();
const pending = row => ({pending:true, reference:reference(row.id), expiresAt:row.expires_at * 1000, resendAt:(row.created_at + RESEND_SECONDS) * 1000});
const escapeHtml = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Returns null only when this request may proceed to the app/static handler.
// Delivery is injected so tests never send real mail or need a login bypass.
export async function accessResponse(request, env, deliver) {
  const url = new URL(request.url), now = Math.floor(Date.now() / 1000);
  if (PUBLIC_PATHS.has(url.pathname) && ['GET', 'HEAD'].includes(request.method)) return null;
  if (!env.AUTH_DB || !env.AUTH_SECRET || env.AUTH_SECRET.length < 32) return json({error:'Access service is not ready.'}, 503);
  const db = env.AUTH_DB;
  if (!url.pathname.startsWith('/auth/')) {
    if (await session(request, db, now)) return null;
    if (['GET','HEAD'].includes(request.method) && (url.pathname === '/' || url.pathname === '/index.html' || (request.headers.get('Accept') || '').includes('text/html'))) {
      return new Response(null, {status:303, headers:{Location:'/login', 'Cache-Control':'no-store', Vary:'Cookie'}});
    }
    return json({error:'Sign in to access Tuka.'}, 401);
  }
  if (url.pathname === '/auth/session' && request.method === 'GET') {
    const current = await session(request, db, now);
    if (current) return json({authenticated:true, expiresAt:current.expires_at * 1000});
    const outstanding = await challenge(request, db, now);
    return json({authenticated:false, ...(outstanding && outstanding.attempts < 5 ? pending(outstanding) : {pending:false})});
  }
  if (request.method !== 'POST') return json({error:'Method not allowed.'}, 405);
  if (request.headers.get('Origin') !== env.PUBLIC_ORIGIN || url.origin !== env.PUBLIC_ORIGIN) return json({error:'Request not allowed.'}, 403);
  if (url.pathname === '/auth/logout') {
    const token = cookie(request, SESSION_COOKIE);
    if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hash(token)).run();
    return json({ok:true}, 200, [setCookie(SESSION_COOKIE, '', 0), setCookie(REQUEST_COOKIE, '', 0)]);
  }
  let input;
  try { input = await body(request); } catch { return json({error:'Check the form and try again.'}, 400); }
  if (url.pathname === '/auth/request' || url.pathname === '/auth/resend') {
    if (await session(request, db, now)) return json({authenticated:true});
    const resending = url.pathname === '/auth/resend';
    const outstanding = await challenge(request, db, now);
    if (resending && !outstanding) return json({error:'No active code to resend. Request access again, or wait if a code is already being sent.'}, 409);
    const label = resending ? outstanding.label : typeof input.label === 'string' ? input.label.trim() : '';
    if (!label || label.length > 48 || /[\x00-\x1f\x7f]/.test(label)) return json({error:'Enter a name or device label, up to 48 characters.'}, 400);
    if (outstanding) {
      if (outstanding.attempts >= 5) return json({error:'Too many attempts. Wait until the current code expires.'}, 429);
      if (!resending) return json(pending(outstanding));
      if (now < outstanding.created_at + RESEND_SECONDS) return json({error:'Wait one minute between codes.', resendAt:(outstanding.created_at + RESEND_SECONDS) * 1000}, 429);
    }
    const key = await keyFor(env.AUTH_SECRET);
    const ipKey = await mac(key, 'rate:' + (request.headers.get('CF-Connecting-IP') || 'unknown'));
    if (!await limit(db, 'ip:' + ipKey, 5, 3600, now) || !await limit(db, 'mail-hour', 10, 3600, now) || !await limit(db, 'mail-day', 30, 86400, now)) {
      return json({error:'Too many access requests. Please try again later.'}, 429);
    }
    if (!env.OWNER_ADDRESS || !env.SENDER_ADDRESS) return json({error:'Code delivery is not ready.'}, 503);
    const browserToken = cookie(request, REQUEST_COOKIE) || randomToken();
    const browserHash = await hash(browserToken), id = crypto.randomUUID(), code = randomCode();
    if (!resending) await db.batch([
      db.prepare('DELETE FROM challenges WHERE expires_at <= ?').bind(now),
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
      db.prepare('DELETE FROM request_limits WHERE expires_at <= ?').bind(now),
    ]);
    const codeMac = await mac(key, `code:${id}:${code}`);
    // Claim the current generation atomically before sending. Resends keep the
    // failed-attempt count; racing resends or redemption cannot mint extra codes.
    const inserted = resending
      ? await db.prepare('UPDATE challenges SET id = ?, code_mac = ?, created_at = ?, expires_at = ?, delivered = 0 WHERE id = ? AND browser_hash = ? AND delivered = 1 AND attempts < 5 AND expires_at > ? RETURNING id')
        .bind(id, codeMac, now, now + CODE_SECONDS, outstanding.id, browserHash, now).first()
      : await db.prepare('INSERT OR IGNORE INTO challenges (id, browser_hash, code_mac, label, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
        .bind(id, browserHash, codeMac, label, now, now + CODE_SECONDS).first();
    if (!inserted) return json({error:'An access request is already being sent. Try again in a moment.'}, 409);
    try {
      await deliver({
        to:env.OWNER_ADDRESS,
        from:{email:env.SENDER_ADDRESS, name:'Tuka'},
        subject:`Tuka access request ${reference(id)}`,
        text:`Tuka browser access request\n\nVisitor-provided label: ${label}\nRequest: ${reference(id)}\n\nOne-time code: ${code}\n\nOnly share this code with the person you intend to approve, after checking the request reference with them. It works only in the browser that requested it and expires in 10 minutes. That browser stays signed in for up to 180 days, unless its access is revoked or its cookies are cleared. Ignore this email if you do not recognize the request.`,
        html:`<h1>Tuka access request</h1><p>Visitor-provided label: <strong>${escapeHtml(label)}</strong></p><p>Request: <strong>${reference(id)}</strong></p><p style="font-size:28px;letter-spacing:4px"><strong>${code}</strong></p><p>Share this code only with someone you intend to approve, after checking their request reference. It works only in the requesting browser and expires in 10 minutes.</p><p>That browser stays signed in for up to 180 days, unless revoked or its cookies are cleared. Ignore requests you do not recognize.</p>`,
      });
      await db.prepare('UPDATE challenges SET delivered = 1 WHERE id = ?').bind(id).run();
    } catch {
      // A delivery failure must not strand a browser with an unusable old email.
      // Keep any attempts made before the claim; never restore a deleted request.
      if (resending) await db.prepare('UPDATE challenges SET id = ?, code_mac = ?, created_at = ?, expires_at = ?, delivered = 1 WHERE id = ? AND browser_hash = ?')
        .bind(outstanding.id, outstanding.code_mac, outstanding.created_at, outstanding.expires_at, id, browserHash).run();
      else await db.prepare('DELETE FROM challenges WHERE id = ?').bind(id).run();
      console.error(JSON.stringify({event:'access_email_failed'}));
      return json({error:resending ? 'The new code could not be sent. Your previous code still works until it expires.' : 'The code could not be sent. Please try again later.'}, 503);
    }
    return json(pending({id, created_at:now, expires_at:now + CODE_SECONDS}), 200, [setCookie(REQUEST_COOKIE, browserToken, CODE_SECONDS)]);
  }
  if (url.pathname === '/auth/verify') {
    const browserToken = cookie(request, REQUEST_COOKIE);
    if (!browserToken || typeof input.code !== 'string' || !/^\d{8}$/.test(input.code)) return json({error:'Enter the eight-digit code for this browser.'}, 400);
    const browserHash = await hash(browserToken);
    const row = await db.prepare('UPDATE challenges SET attempts = attempts + 1 WHERE browser_hash = ? AND expires_at > ? AND delivered = 1 AND attempts < 5 RETURNING id, code_mac, label')
      .bind(browserHash, now).first();
    if (!row) return json({error:'The code expired or too many attempts were made. Request access again after it expires.'}, 401);
    const valid = await crypto.subtle.verify('HMAC', await keyFor(env.AUTH_SECRET), fromHex(row.code_mac), encoder.encode(`code:${row.id}:${input.code}`));
    if (!valid) return json({error:'That code is not valid for this browser.'}, 401);
    const consumed = await db.prepare('DELETE FROM challenges WHERE id = ? AND browser_hash = ? AND expires_at > ? RETURNING id').bind(row.id, browserHash, now).first();
    if (!consumed) return json({error:'This code has already been used.'}, 401);
    const token = randomToken();
    await db.prepare('INSERT INTO sessions (id, token_hash, label, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), await hash(token), row.label, now, now + SESSION_SECONDS).run();
    return json({authenticated:true}, 200, [setCookie(SESSION_COOKIE, token, SESSION_SECONDS), setCookie(REQUEST_COOKIE, '', 0)]);
  }
  return json({error:'Not found.'}, 404);
}
