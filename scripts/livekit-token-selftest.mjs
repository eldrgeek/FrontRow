// Selftest for netlify/functions/get-livekit-token.ts: audience tokens stay
// open, the "performer" identity and role need a signed-in FrontRow admin.
// Bundles the real function with esbuild and answers Supabase with a stub.
//
//   npm run test:livekit-token   (needs netlify/functions/ and front-row-vite/ node_modules)

import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fnDir = path.join(root, 'netlify/functions');
const { build } = createRequire(path.join(root, 'front-row-vite/package.json'))('esbuild');

// Stub Supabase: three bearer tokens, the RPC says no (so the email list decides).
const USERS = {
  'tok-admin': { id: 'u1', email: 'mw@mike-wolf.com' },
  'tok-guest': { id: 'u2', email: 'someone@example.com' },
};
const stub = http.createServer((req, res) => {
  const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (req.url === '/auth/v1/user') {
    const u = USERS[tok];
    res.writeHead(u ? 200 : 401, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(u || { error: 'bad' }));
  }
  if (req.url === '/rest/v1/rpc/is_app_admin') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('false');
  }
  res.writeHead(404).end();
});
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
process.env.SUPABASE_URL = `http://127.0.0.1:${stub.address().port}`;
process.env.SUPABASE_ANON_KEY = 'anon-test';
process.env.LIVEKIT_API_KEY = 'APItest';
process.env.LIVEKIT_API_SECRET = 'secret-test-secret-test-secret-test';
delete process.env.VITE_SUPABASE_URL;
delete process.env.VITE_SUPABASE_ANON_KEY;

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lk-token-'));
const outfile = path.join(outDir, 'fn.mjs');
await build({
  entryPoints: [path.join(fnDir, 'get-livekit-token.ts')],
  bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent',
  nodePaths: [path.join(fnDir, 'node_modules')],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
const { handler } = await import(pathToFileURL(outfile).href);

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const call = (q, auth) => handler({ httpMethod: 'GET', queryStringParameters: q, headers: auth ? { authorization: `Bearer ${auth}` } : {} });
const sub = (res) => { const t = JSON.parse(res.body).token; const p = t.split('.')[1]; return JSON.parse(Buffer.from(p, 'base64url')).sub; };

let r = await call({ identity: 'a-abc123', role: 'audience', room: 'frontrow-main' });
check('guest with no account gets an audience token', r.statusCode === 200 && sub(r) === 'a-abc123', r.body);
r = await call({ identity: 'performer', role: 'performer', room: 'frontrow-main' });
check('anonymous performer is refused', r.statusCode === 403, String(r.statusCode));
r = await call({ identity: 'performer', role: 'audience', room: 'frontrow-main' });
check('anonymous "performer" identity under the audience role is refused', r.statusCode === 403, String(r.statusCode));
r = await call({ identity: 'Jess', role: 'performer', room: 'frontrow-main' }, 'tok-guest');
check('signed-in non-admin performer is refused', r.statusCode === 403, String(r.statusCode));
r = await call({ identity: 'performer', role: 'performer', room: 'frontrow-main' }, 'tok-bogus');
check('bad session is refused', r.statusCode === 403, String(r.statusCode));
r = await call({ identity: 'performer', role: 'performer', room: 'frontrow-main' }, 'tok-admin');
// #6 (server/tickets.mjs) names a performer performer-<id>; nobody else may take a performer name.
check('admin gets a performer token', r.statusCode === 200 && /^performer-[a-z0-9]+$/.test(sub(r)), r.body);
r = await call({ identity: 'Jess', role: 'performer', room: 'frontrow-main' }, 'tok-admin');
check('admin performer token always carries a performer identity', r.statusCode === 200 && /^performer-[a-z0-9]+$/.test(sub(r)), r.body);
r = await call({ identity: 'performer', role: 'performer', room: 'frontrow-main', cam: 'stage' }, 'tok-admin');
const mainId = sub(await call({ identity: 'performer', role: 'performer', room: 'frontrow-main' }, 'tok-admin'));
check('a second performer camera joins beside the first (cam=stage)', r.statusCode === 200 && sub(r) === `${mainId}-stage`, r.body);
r = await call({ identity: 'performer', role: 'performer', room: 'frontrow-main', cam: 'Stage/../x' }, 'tok-admin');
check('a malformed cam name is ignored', r.statusCode === 200 && sub(r) === mainId, r.body);
r = await call({ identity: 'Guest', role: 'audience', room: 'frontrow-main', cam: 'stage' });
check('cam does not make an audience identity a performer one', r.statusCode === 200 && sub(r) === 'Guest', r.body);
r = await call({ identity: 'x', role: 'audience', room: 'other-room' });
check('non-frontrow room is refused', r.statusCode === 403, String(r.statusCode));
r = await handler({ httpMethod: 'OPTIONS', headers: {} });
check('CORS preflight allows Authorization', r.statusCode === 204 && /Authorization/.test(r.headers['Access-Control-Allow-Headers']));

stub.close();
fs.rmSync(outDir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
