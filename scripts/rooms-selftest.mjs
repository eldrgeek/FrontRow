// Per-room runtime selftest: each theater screen is its own house on
// frontrow-server (server/rooms.js). Runs the real server on a scratch port
// with real Socket.io clients and checks that houses do not leak into each
// other: seats, show state, chat, signaling, reactions, seat caps.
//
//   npm run test:rooms        (needs server/ and front-row-vite/ node_modules)

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire(import.meta.url);
const rooms = require(path.join(root, 'server/rooms.js'));
const { io } = createRequire(path.join(root, 'front-row-vite/package.json'))('socket.io-client');

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  ok  ', msg); } else { fail++; console.log('  FAIL', msg); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. Names ────────────────────────────────────────────────────────────────
console.log('names');
ok(rooms.livekitRoomFor('front-row', 'live') === 'frontrow-main', 'Front Row live keeps frontrow-main');
ok(rooms.livekitRoomFor('front-row', 'library') === 'frontrow-front-row--library', 'kit room is frontrow-<venue>--<room>');
ok(JSON.stringify(rooms.parseScope({})) === '{"venue":"front-row","room":"live"}', 'no query means Front Row live');
ok(JSON.stringify(rooms.parseScope({ room: 'frontrow-main' })) === '{"venue":"front-row","room":"live"}', 'frontrow-main alias parses');
ok(JSON.stringify(rooms.parseScope({ room: 'frontrow-big-house--screen-3' })) === '{"venue":"big-house","room":"screen-3"}', 'LiveKit name parses');
ok(JSON.stringify(rooms.parseScope({ theater: 'big-house', screen: 'screen-3' })) === '{"venue":"big-house","room":"screen-3"}', 'theater/screen aliases');
ok(rooms.parseScope({ venue: 'Bad!' }) === null, 'bad venue refused');
ok(rooms.parseScope({ venue: 'a', room: 'x--y' }) === null, 'a slug never holds "--"');
ok(rooms.parseScope({ venue: 'a'.repeat(41) }) === null, 'venue over 40 refused');
ok(rooms.parseScope({ room: 'frontrow-nope' }) === null, 'unknown LiveKit name refused');
ok(/^frontrow-[a-z0-9-]{1,100}$/.test(rooms.livekitRoomFor('a'.repeat(40), 'b'.repeat(40))), 'longest name fits the token pattern');

const ticketsPath = path.join(root, 'server/tickets.mjs');
if (fs.existsSync(ticketsPath)) {
  const t = await import(ticketsPath);
  for (const [v, r] of [['front-row', 'live'], ['front-row', 'revolution'], ['big-house', 'screen-10']]) {
    ok(t.livekitRoomFor(v, r) === rooms.livekitRoomFor(v, r), `tickets.mjs agrees on ${v}/${r}`);
  }
} else {
  console.log('  (tickets.mjs not on this branch; skipped the cross-check)');
}

// ── 2. Registry ─────────────────────────────────────────────────────────────
console.log('registry');
{
  const reg = rooms.createRegistry({ defaultSeats: 12, pinnedSeats: { 'front-row--live': 12 }, maxRooms: 2 });
  const a = reg.ensure({ venue: 'front-row', room: 'live' }, 80);
  ok(a.maxSeats === 12, 'pinned house ignores a requested count');
  const b = reg.ensure({ venue: 'kit', room: 'one' }, 500);
  ok(b.maxSeats === rooms.SEAT_CAP, 'requested count is capped at 99');
  ok(reg.ensure({ venue: 'kit', room: 'two' }) === null, 'maxRooms refuses a third house');
  ok(reg.ensure({ venue: 'kit', room: 'one' }, 3) === b && b.maxSeats === 99, 'count is fixed when the house is made');
  b.members.add('x');
  ok(!reg.maybeDrop(b), 'a house with a guest stays');
  b.members.clear();
  b.show.status = 'live';
  ok(!reg.maybeDrop(b), 'a live house stays when empty');
  b.show.status = 'idle';
  ok(reg.maybeDrop(b) && reg.size() === 1, 'an empty idle house is dropped');
  a.show.countdown.interval = setInterval(() => {}, 1000);
  const old = a.show;
  reg.resetShow(a);
  ok(a.show !== old && a.show.countdown.interval === null && Array.isArray(a.show.reactions) && a.show.venueConfig, 'reset gives a complete show state');
  ok(old.countdown.interval._destroyed === true, 'reset stops the old countdown');
}

// ── 3. Live server ──────────────────────────────────────────────────────────
console.log('server');
const PORT = 38000 + Math.floor(Math.random() * 1000);
const URL = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, ['index.js'], {
  cwd: path.join(root, 'server'),
  env: { ...process.env, PORT: String(PORT), ENABLE_TEST_ENDPOINTS: 'true', SUPABASE_SERVICE_ROLE_KEY: 'dummy', MAX_HOUSES: '6', MAX_SEATS: '12' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvLog = '';
srv.stdout.on('data', (d) => { srvLog += d; });
srv.stderr.on('data', (d) => { srvLog += d; });
const cleanup = () => { try { srv.kill(); } catch { /* gone */ } };
process.on('exit', cleanup);

for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`${URL}/health`)).ok) break; } catch { /* not up */ }
  await sleep(100);
}

const clients = [];
function guest(query) {
  const s = io(URL, { query, transports: ['websocket'], forceNew: true, reconnection: false });
  s.seen = [];
  s.onAny((ev, data) => s.seen.push([ev, data]));
  clients.push(s);
  return new Promise((resolve) => {
    s.once('house:joined', (h) => { s.house = h; resolve(s); });
    s.once('house:refused', (r) => { s.refused = r; resolve(s); });
    s.once('connect_error', (e) => { s.err = e; resolve(s); });
  });
}
const saw = (s, ev, pred = () => true) => s.seen.some(([e, d]) => e === ev && pred(d));
const ask = (s, ev, data, reply) => new Promise((resolve) => {
  s.once(reply, resolve);
  s.emit(ev, data);
  setTimeout(() => resolve(null), 1500);
});
const api = async (method, p, body) => {
  const r = await fetch(URL + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};

try {
  const live1 = await guest({}); // a page from before the kit
  const live2 = await guest({ venue: 'front-row', room: 'live' });
  const lib1 = await guest({ venue: 'front-row', room: 'library' });
  const lib2 = await guest({ venue: 'front-row', room: 'library' });
  const kit1 = await guest({ venue: 'big-house', room: 'screen-7', seats: '40' });
  const big = await guest({ venue: 'big-house', room: 'screen-8', seats: '500' });

  ok(live1.house && live1.house.livekitRoom === 'frontrow-main' && live1.house.maxSeats === 12, 'no query joins Front Row live (frontrow-main, 12 seats)');
  ok(lib1.house && lib1.house.livekitRoom === 'frontrow-front-row--library', 'library is its own LiveKit room');
  ok(kit1.house && kit1.house.maxSeats === 40, 'a kit house takes its first guest\'s seat count');
  ok(big.house && big.house.maxSeats === 99, 'a kit house never holds more than 99');

  const bad = await guest({ venue: 'Bad Venue' });
  ok(bad.refused && bad.refused.reason === 'unknown-room', 'a malformed house is refused');

  // Seats
  const r1 = await ask(live1, 'select-seat', { seatId: 'seat-3', userName: 'Ann' }, 'seat-selected');
  ok(r1 && r1.success, 'seat-3 taken in Front Row live');
  await sleep(150);
  ok(saw(live2, 'seat-update', (d) => d.seatId === 'seat-3' && d.user), 'the same house sees the seat');
  ok(!saw(lib1, 'seat-update', (d) => d.seatId === 'seat-3'), 'another screen does not see it');
  const r2 = await ask(lib1, 'select-seat', { seatId: 'seat-3', userName: 'Bo' }, 'seat-selected');
  ok(r2 && r2.success, 'seat-3 is free in the library: seats are per house');
  const r3 = await ask(live2, 'select-seat', { seatId: 'seat-12', userName: 'Cy' }, 'seat-selected');
  ok(r3 && !r3.success, 'seat-12 does not exist in a 12-seat house');
  const r4 = await ask(kit1, 'select-seat', { seatId: 'seat-39', userName: 'Di' }, 'seat-selected');
  ok(r4 && r4.success, 'seat-39 exists in a 40-seat house');
  const r5 = await ask(big, 'select-seat', { seatId: 'seat-98', userName: 'Ed' }, 'seat-selected');
  ok(r5 && r5.success, 'seat-98 exists in a 99-seat house');
  const r6 = await ask(big, 'select-seat', { seatId: 'seat-99', userName: 'Ed' }, 'seat-selected');
  ok(r6 && !r6.success, 'seat-99 does not');

  // Late arrivals get only their own house's seats
  const lib3 = await guest({ venue: 'front-row', room: 'library' });
  await sleep(150);
  ok(saw(lib3, 'seat-update', (d) => d.seatId === 'seat-3' && d.user && d.user.name === 'Bo'), 'a late guest gets their house\'s seats');
  ok(!saw(lib3, 'seat-update', (d) => d.user && d.user.name === 'Ann'), 'and not another house\'s');

  // Show state
  lib2.emit('artist-go-live');
  await sleep(200);
  ok(saw(lib1, 'show-status-update', (d) => d.status === 'live'), 'the library goes live for its own guests');
  ok(!saw(live1, 'show-status-update', (d) => d.status === 'live'), 'Front Row live stays dark');
  ok(saw(lib2, 'new-audience-member', (id) => id === lib1.id), 'the performer is told about their own house');
  ok(!saw(lib2, 'new-audience-member', (id) => id === live1.id || id === kit1.id), 'and not about other houses');
  const st = await api('GET', '/api/test/state?venue=front-row&room=library');
  const st0 = await api('GET', '/api/test/state');
  ok(st.body.show.status === 'live' && st0.body.show.status === 'idle', '/api/test/state reads one house');
  ok(st.body.seats.totalSeats === 12 && st0.body.seats.occupiedCount === 1, 'and its own seats');

  // HTTP endpoints name a house
  const sim = await api('POST', '/api/artist-simulate-live', { venue: 'big-house', room: 'screen-7' });
  await sleep(150);
  ok(sim.status === 200 && saw(kit1, 'show-status-update', (d) => d.status === 'live'), 'simulate-live reaches the named house');
  ok(!saw(big, 'show-status-update', (d) => d.status === 'live'), 'and only that one');
  ok((await api('POST', '/api/artist-simulate-live?venue=Nope!')).status === 400, 'a malformed house is a 400');

  // Chat
  lib1.emit('postshow:chat', { text: 'what a night' });
  await sleep(150);
  ok(saw(lib3, 'postshow:chat', (d) => d.text === 'what a night'), 'chat reaches the house');
  ok(!saw(live1, 'postshow:chat'), 'and not other houses');
  const hist = await ask(live2, 'postshow:history', null, 'postshow:history');
  ok(Array.isArray(hist) && hist.length === 0, 'chat history is per house');

  // Signaling never crosses houses
  live1.emit('offer', { sdp: 'x', targetSocketId: lib1.id });
  lib2.emit('offer', { sdp: 'y', targetSocketId: lib1.id });
  await sleep(150);
  ok(!saw(lib1, 'offer', (d) => d.offererSocketId === live1.id), 'an offer from another house is dropped');
  ok(saw(lib1, 'offer', (d) => d.offererSocketId === lib2.id), 'an offer within the house is relayed');

  // Reactions and spotlight
  lib1.emit('audience:reaction', { type: 'clap' });
  lib1.emit('performer:spotlight', { active: true });
  await sleep(700);
  ok(saw(lib3, 'stage:reactionLevel', (d) => d.level > 0), 'the house hears its applause');
  ok(!saw(live2, 'stage:reactionLevel', (d) => d.level > 0), 'other houses do not');
  ok(saw(lib3, 'performer:spotlight', (d) => d.active) && !saw(live2, 'performer:spotlight'), 'spotlight is per house');

  // The seat cap holds per house
  const extra = [];
  for (let i = 0; i < 12; i++) extra.push(await guest({ venue: 'front-row', room: 'live' }));
  const results = [];
  for (let i = 0; i < 12; i++) results.push(await ask(extra[i], 'select-seat', { seatId: `seat-${i}`, userName: `G${i}` }, 'seat-selected'));
  ok(results.filter((r) => r && r.success).length === 11, 'Front Row live seats 12 and no more (one already taken)');

  // House limit and cleanup
  const h = await api('GET', '/api/test/houses');
  ok(h.body.houses.length === 4, `four houses open (${h.body.houses.map((x) => x.venue + '/' + x.room).join(', ')})`);
  const fill1 = await guest({ venue: 'kit', room: 'a' });
  const fill2 = await guest({ venue: 'kit', room: 'b' });
  const over = await guest({ venue: 'kit', room: 'c' });
  ok(fill1.house && fill2.house && over.refused && over.refused.reason === 'busy', 'MAX_HOUSES refuses the seventh house');
  fill1.disconnect();
  await sleep(200);
  const again = await guest({ venue: 'kit', room: 'c' });
  ok(again.house, 'an empty house is dropped and frees its slot');
  const kit2 = await guest({ venue: 'big-house', room: 'screen-7', seats: '3' });
  ok(kit2.house && kit2.house.maxSeats === 40, 'a later guest cannot change a house\'s seat count');
} catch (e) {
  fail++;
  console.log('  FAIL threw:', e && e.stack);
} finally {
  for (const c of clients) c.disconnect();
  cleanup();
}

if (/TypeError|ReferenceError/.test(srvLog)) {
  fail++;
  console.log('  FAIL server logged an error:\n' + srvLog.split('\n').filter((l) => /Error/.test(l)).slice(0, 5).join('\n'));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
