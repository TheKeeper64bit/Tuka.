import {spawnSync} from 'node:child_process';
const [action, id] = process.argv.slice(2);
let sql;
if (action === 'list') sql = 'SELECT id, label, datetime(created_at,\'unixepoch\') AS approved_at, datetime(expires_at,\'unixepoch\') AS expires_at FROM sessions WHERE expires_at > unixepoch() ORDER BY created_at DESC;';
else if (action === 'revoke' && /^[a-f0-9-]{36}$/.test(id || '')) sql = `DELETE FROM sessions WHERE id = '${id}';`;
else { console.error('Usage: npm run access -- list | revoke <session-id>'); process.exit(1); }
const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js','d1','execute','tuka-access','--remote','--command',sql], {stdio:'inherit'});
process.exit(result.status ?? 1);
