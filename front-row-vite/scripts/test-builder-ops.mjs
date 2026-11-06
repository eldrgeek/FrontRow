// Unit tests for the theater builder's edit ops (src/builder/ops.ts) and the
// preview layout rules (src/builder/layout.ts). No browser: esbuild bundles
// the TypeScript, node:test runs it.  npm run test:builder
import { build } from 'esbuild';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(join(tmpdir(), 'builder-ops-'));
process.on('exit', () => rmSync(out, { recursive: true, force: true }));

async function load(entry) {
  const file = join(out, entry.replace(/\W/g, '_') + '.mjs');
  await build({ entryPoints: [join(root, entry)], bundle: true, format: 'esm', platform: 'node', outfile: file, logLevel: 'silent' });
  return import(pathToFileURL(file).href);
}

const ops = await load('src/builder/ops.ts');
const layout = await load('src/builder/layout.ts');
const { frontRowTheater, validateDefinition } = await load('src/theater/definition.ts');
const { APP_OPS } = await load('src/builder/opSchemas.ts');

const ok = (op, args) => {
  const c = ops.checkOp(op, args);
  assert.ok(c.ok, `expected ${op} to check: ${JSON.stringify(c.errors)}`);
  return c.op;
};
const bad = (op, args, re) => {
  const c = ops.checkOp(op, args);
  assert.equal(c.ok, false, `expected ${op} ${JSON.stringify(args)} to be refused`);
  if (re) assert.match(c.errors.join(' | '), re);
};
const apply = (edit, def = frontRowTheater) => {
  const r = ops.applyOp(def, edit);
  assert.ok(!('errors' in r), `expected apply to work: ${JSON.stringify(r.errors)}`);
  return r;
};

test('the op schemas declared to the room name exactly the ops', () => {
  assert.deepEqual(APP_OPS.map((o) => o.name), ['setScreens', 'setTheme', 'setRoom', 'issueTickets', 'addShelfItem', 'removeShelfItem']);
  assert.deepEqual(APP_OPS.map((o) => o.name), [...ops.OP_NAMES]);
  // Who may decide is the builder grant, checked by the page and the save RPC, not room creator status.
  for (const o of APP_OPS) assert.equal(o.approve, 'app');
  const tix = APP_OPS.find((o) => o.name === 'issueTickets');
  assert.ok(tix.args.required.includes('validFrom') && tix.args.required.includes('validUntil'));
  assert.ok(JSON.stringify(APP_OPS).length < 16 * 1024, 'room limit is 16 KB');
  for (const o of APP_OPS) assert.match(o.name, /^[A-Za-z][A-Za-z0-9_]{0,39}$/);
});

test('unknown ops and non-object args are refused', () => {
  bad('deleteTheater', {}, /unknown op/);
  bad('setTheme', 'make it blue', /args must be an object/);
  bad('setTheme', [], /args must be an object/);
});

test('setScreens: five screens, keeping the live one, adds two shelves', () => {
  const edit = ok('setScreens', {
    screens: [{ id: 'revolution' }, { id: 'live' }, { id: 'library' }, { id: 'kids', title: 'Kids Corner' }, { id: 'poetry', template: 'roundtable' }],
  });
  const r = apply(edit);
  assert.equal(r.next.screens.length, 5);
  assert.deepEqual(r.next.screens.map((s) => s.order), [0, 1, 2, 3, 4]);
  const kids = r.next.screens.find((s) => s.id === 'kids');
  assert.equal(kids.kind, 'shelf');
  assert.equal(kids.title, 'Kids Corner');
  assert.equal(r.next.screens.find((s) => s.id === 'poetry').template, 'roundtable');
  assert.deepEqual(validateDefinition(r.next), []);
  assert.ok(r.changes.some((c) => c.includes('Add screen "Kids Corner"')));
  // the live screen kept its seats
  assert.equal(r.next.screens.find((s) => s.id === 'live').seats.count, 12);
  // pure: the input is untouched
  assert.equal(frontRowTheater.screens.length, 3);
});

test('setScreens: reorder and remove are logged', () => {
  const r = apply(ok('setScreens', { screens: [{ id: 'live' }, { id: 'library' }] }));
  assert.deepEqual(r.changes, [
    'Move the live screen to door 1',
    'Move "The Performance Library" to door 2',
    'Remove screen "Songs of the Revolution"',
  ]);
});

test('setScreens: refuses duplicates, bad ids, too many, and two live screens', () => {
  bad('setScreens', { screens: [{ id: 'a' }, { id: 'a' }] }, /used twice/);
  bad('setScreens', { screens: [{ id: 'Bad Id' }] }, /lowercase/);
  bad('setScreens', { screens: Array.from({ length: 11 }, (_, i) => ({ id: `s${i}` })) }, /1 to 10/);
  bad('setScreens', { screens: [] }, /1 to 10/);
  bad('setScreens', { screens: [{ id: 'a', colour: 'red' }] }, /unknown field "colour"/);
  const r = ops.applyOp(frontRowTheater, ok('setScreens', { screens: [{ id: 'live' }, { id: 'library', kind: 'live' }] }));
  assert.ok('errors' in r && r.errors.some((e) => /frontrow-main/.test(e)), 'a second live screen is refused until per-room runtime');
});

test('setTheme: colors and curtain', () => {
  const r = apply(ok('setTheme', { palette: { accent: '#1C2F6B' }, curtain: 'velvet-blue' }));
  assert.equal(r.next.theme.palette.accent, '#1c2f6b');
  assert.equal(r.next.theme.curtain, 'velvet-blue');
  assert.equal(r.next.theme.palette.wall, frontRowTheater.theme.palette.wall);
  bad('setTheme', { palette: { accent: 'blue' } }, /color like/);
  bad('setTheme', { palette: { accent: 'url(javascript:alert(1))' } }, /color like/);
  bad('setTheme', { palette: { glow: '#ffffff' } }, /unknown field "glow"/);
  bad('setTheme', { curtain: 'tartan' }, /curtain must be one of/);
  bad('setTheme', {}, /needs a palette or a curtain/);
});

test('setRoom: seats and arrangement only on the live screen', () => {
  const r = apply(ok('setRoom', { screen: 'live', seats: 40, arrangement: 'rows', template: 'cabaret' }));
  const live = r.next.screens.find((s) => s.id === 'live');
  assert.deepEqual(live.seats, { count: 40, arrangement: 'rows' });
  assert.equal(live.template, 'cabaret');
  assert.ok(r.changes.includes('the live screen seats: 12 → 40'));
  const shelf = ops.applyOp(frontRowTheater, ok('setRoom', { screen: 'library', seats: 10 }));
  assert.ok('errors' in shelf && /only the live screen has seats/.test(shelf.errors[0]));
  const missing = ops.applyOp(frontRowTheater, ok('setRoom', { screen: 'nope', title: 'X' }));
  assert.ok('errors' in missing);
  bad('setRoom', { screen: 'live', seats: 0 }, new RegExp(`1 to ${ops.MAX_SEATS}`));
  bad('setRoom', { screen: 'live', seats: ops.MAX_SEATS + 1 }, /whole number/);
  const horse = apply(ok('setRoom', { screen: 'live', arrangement: 'horseshoe' }));
  assert.equal(horse.next.screens.find((s) => s.id === 'live').seats.arrangement, 'horseshoe');
  bad('setRoom', { screen: 'live', seats: 12.5 }, /whole number/);
  bad('setRoom', { screen: 'live' }, /needs something to change/);
});

test('text from an AI is cleaned: no tags, no control characters, length capped', () => {
  const edit = ok('setRoom', { screen: 'library', title: 'Library <script>x</script>', blurb: 'line\u0000one\n\ttwo' });
  assert.equal(edit.args.title, 'Library scriptx/script');
  assert.equal(edit.args.blurb, 'lineone two');
  bad('setRoom', { screen: 'library', title: 'x'.repeat(61) }, /longer than 60/);
  bad('setRoom', { screen: 'library', marquee: ['a', 'b', 'c', 'd'] }, /1 to 3 lines/);
});

test('issueTickets: checked, previewed, and does not change the definition', () => {
  const edit = ok('issueTickets', {
    scope: 'performance', screen: 'live', performance: 'jess-wayne', count: 20, role: 'audience', channel: 'sent',
    validFrom: '2026-11-07T19:45:00-05:00', validUntil: '2026-11-07T21:30:00-05:00', uses: 2,
  });
  const r = apply(edit);
  assert.equal(r.next, frontRowTheater);
  assert.equal(r.tickets.count, 20);
  assert.match(r.changes[0], /^Issue 20 audience tickets for jess-wayne in "live" \(sent, 2 uses each, good /);
  const W = { validFrom: '2026-11-07T19:00Z', validUntil: '2026-11-07T23:00Z' };
  bad('issueTickets', { scope: 'venue', count: 5, role: 'audience', ...W }, /channel is required/);
  bad('issueTickets', { scope: 'venue', count: 5, role: 'audience', channel: 'door' }, /validFrom is required/);
  bad('issueTickets', { scope: 'screen', count: 5, role: 'audience', channel: 'door', ...W }, /needs a screen/);
  bad('issueTickets', { scope: 'venue', count: 201, role: 'audience', channel: 'door', ...W }, /1 to 200/);
  bad('issueTickets', { scope: 'venue', count: 1, role: 'owner', channel: 'door', ...W }, /role must be one of/);
  bad('issueTickets', { scope: 'venue', count: 2, role: 'crew', channel: 'sent', holders: ['a', 'b', 'c'], ...W }, /one person per ticket/);
  bad('issueTickets', { scope: 'venue', count: 2, role: 'crew', channel: 'sent', validFrom: '2026-11-07T22:00Z', validUntil: '2026-11-07T21:00Z' }, /after validFrom/);
  bad('issueTickets', { scope: 'venue', count: 2, role: 'audience', channel: 'door', seat: 'seat-3', ...W }, /one ticket/);
  bad('issueTickets', { scope: 'venue', count: 1, role: 'audience', channel: 'door', seat: 'A3', ...W }, /seat-3/);
  bad('issueTickets', { scope: 'venue', count: 1, role: 'audience', channel: 'door', uses: 0, ...W }, /uses/);
  const ghost = ops.applyOp(frontRowTheater, ok('issueTickets', { scope: 'screen', screen: 'ghost', count: 1, role: 'audience', channel: 'comp', ...W }));
  assert.ok('errors' in ghost);
});

test('lobby layout rule: row up to 3, arc up to 6, corridor beyond', () => {
  assert.deepEqual([1, 3, 4, 6, 7, 10].map(layout.lobbyLayout), ['row', 'row', 'arc', 'arc', 'corridor', 'corridor']);
});

test('floor plans draw the house\'s own seat layout, inside the box', () => {
  for (const arr of ops.ARRANGEMENTS) {
    for (const n of [1, 12, 40, ops.MAX_SEATS]) {
      const plan = layout.floorPlan({ count: n, arrangement: arr });
      assert.equal(plan.seats.length, n, `${arr} ${n}`);
      assert.equal(plan.arrangement, arr);
      for (const [x, y] of plan.seats) assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= plan.height, `${arr} ${n} inside`);
    }
  }
  // no arrangement: the template's
  assert.equal(layout.floorPlan({ count: 12 }, 'black-box').arrangement, 'horseshoe');
});

test('enums and palette keys track definition.ts', () => {
  assert.ok(ops.ARRANGEMENTS.includes('horseshoe'));
  assert.equal(ops.PALETTE_KEYS.length, 16);
  for (const k of ops.BASE_PALETTE_KEYS) assert.ok(k in frontRowTheater.theme.palette);
  const r = apply(ok('setTheme', { palette: { stageWood: '#3a2a1a' } }));
  assert.equal(r.next.theme.palette.stageWood, '#3a2a1a');
});

test('an issueTickets op becomes the body /api/ticket-issue takes', async () => {
  const { ticketRequestBody } = await load('src/builder/tickets.ts');
  const W = { validFrom: '2026-11-07T19:00:00.000Z', validUntil: '2026-11-07T23:00:00.000Z' };
  assert.deepEqual(ticketRequestBody('front-row', { scope: 'venue', count: 20, role: 'audience', channel: 'sent', ...W }),
    { venue: 'front-row', role: 'audience', channel: 'sent', ...W, maxDevices: 1, count: 20 });
  assert.deepEqual(ticketRequestBody('front-row', { scope: 'performance', screen: 'live', performance: 'jess-wayne', count: 1, role: 'performer', channel: 'comp', seat: 'seat-3', uses: 2, ...W }),
    { venue: 'front-row', room: 'live', performance: 'jess-wayne', role: 'performer', channel: 'comp', ...W, maxDevices: 2, seat: 'seat-3', count: 1 });
  const named = ticketRequestBody('front-row', { scope: 'screen', screen: 'live', count: 2, role: 'crew', channel: 'sent', holders: ['Noel', 'Jess'], ...W });
  assert.deepEqual(named.holders, ['Noel', 'Jess']);
  assert.equal(named.count, undefined);
});

test('addShelfItem: a YouTube link goes on the library shelf as an id', () => {
  const edit = ok('addShelfItem', { screen: 'library', title: 'Noel at the Bitter End', artist: 'Noel Paul Stookey', youtube: 'https://www.youtube.com/watch?v=AbCdEf12345&t=3' });
  assert.equal(edit.args.youtube, 'AbCdEf12345');
  const r = apply(edit);
  const shelf = r.next.screens.find((s) => s.id === 'library').shelf;
  assert.equal(shelf.length, 2);
  assert.deepEqual(shelf[1], { title: 'Noel at the Bitter End', artist: 'Noel Paul Stookey', youtubeId: 'AbCdEf12345' });
  assert.match(r.changes[0], /Shelve "Noel at the Bitter End"/);
  assert.deepEqual(validateDefinition(r.next), []);
});

test('addShelfItem: a file recording, at the front, with its performance', () => {
  const r = apply(ok('addShelfItem', { screen: 'library', title: 'Second set', artist: 'Jess Wayne', videoUrl: 'https://media.example.org/a.mp4', performance: 'jess-wayne', at: 0 }));
  const shelf = r.next.screens.find((s) => s.id === 'library').shelf;
  assert.equal(shelf[0].videoUrl, 'https://media.example.org/a.mp4');
  assert.equal(shelf[0].performanceSlug, 'jess-wayne');
  assert.equal(shelf[0].youtubeId, undefined);
});

test('addShelfItem: refused shapes', () => {
  bad('addShelfItem', { screen: 'library', title: 'x', artist: 'y' }, /youtube id or link, or a videoUrl/);
  bad('addShelfItem', { screen: 'library', title: 'x', artist: 'y', youtube: 'not a link at all!' }, /YouTube id or link/);
  bad('addShelfItem', { screen: 'library', title: 'x', artist: 'y', videoUrl: 'http://plain.example/a.mp4' }, /https/);
  bad('addShelfItem', { screen: 'library', title: 'x', artist: 'y', videoUrl: 'javascript:alert(1)' }, /https/);
  bad('addShelfItem', { screen: 'library', title: 'x', artist: 'y', youtube: 'AbCdEf12345', videoUrl: 'https://a.example/b.mp4' }, /not both/);
  bad('addShelfItem', { screen: 'library', artist: 'y', youtube: 'AbCdEf12345' }, /title is required/);
  bad('addShelfItem', { screen: 'library', title: 'x', artist: 'y', youtube: 'AbCdEf12345', performance: 'Bad Slug' }, /performance slug/);
  bad('addShelfItem', { screen: 'library', title: 'x', artist: 'y', youtube: 'AbCdEf12345', extra: 1 }, /unknown field/);
});

test('addShelfItem: not on the live screen, not twice', () => {
  const live = ops.applyOp(frontRowTheater, ok('addShelfItem', { screen: 'live', title: 'x', artist: 'y', youtube: 'AbCdEf12345' }));
  assert.match(live.errors[0], /only shelves hold videos/);
  const twice = ops.applyOp(frontRowTheater, ok('addShelfItem', { screen: 'library', title: 'Again', artist: 'y', youtube: 'K6ZeroIZd5g' }));
  assert.match(twice.errors[0], /already on/);
  const none = ops.applyOp(frontRowTheater, ok('addShelfItem', { screen: 'attic', title: 'x', artist: 'y', youtube: 'AbCdEf12345' }));
  assert.match(none.errors[0], /no screen/);
});

test('removeShelfItem: by id, by link, by title', () => {
  for (const item of ['K6ZeroIZd5g', 'https://youtu.be/K6ZeroIZd5g', 'Jess Wayne Trio, Part III']) {
    const r = apply(ok('removeShelfItem', { screen: 'library', item }));
    assert.equal(r.next.screens.find((s) => s.id === 'library').shelf.length, 0, item);
  }
  const miss = ops.applyOp(frontRowTheater, ok('removeShelfItem', { screen: 'library', item: 'nope' }));
  assert.match(miss.errors[0], /has no "nope"/);
});

test('validateDefinition: a shelf item needs a YouTube id or an https file', () => {
  const def = structuredClone(frontRowTheater);
  def.screens[2].shelf.push({ title: 'Bad', artist: 'x', videoUrl: 'http://x.example/a.mp4' });
  assert.match(validateDefinition(def).join(' | '), /needs a youtubeId or an https videoUrl/);
});
