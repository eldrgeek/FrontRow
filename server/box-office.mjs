// Front Row box office (theater kit gap 3, 2026-11-05). Built on the ticket
// grants in server/tickets.mjs; stored by migrations/007_box_office.sql.
//
// Two ways a ticket leaves the box office:
//
//  1. SENT BY EMAIL. The manager pastes a guest list. The box office first
//     PREVIEWS: it names every recipient, the sender and the letter, and
//     issues nothing. Only a SEND that repeats the exact list the manager was
//     shown (`shown`) issues the tickets; the server recomputes the list itself
//     and refuses a mismatch. The ticket code is then SEALED to the Mac mail
//     worker's public key and queued. The mail credential lives on Mike's Mac
//     only (soma-zoom-presence's offer-worker pattern): the worker polls
//     /api/mail-work, opens the sealed code, writes the letter from a fixed
//     template and sends it (scripts/ticket-mail-worker.mjs). Neither the
//     database nor these functions can read a queued code back, and the
//     sealed copy is wiped once the letter is sent.
//
//  2. DOOR CODES. The manager makes N door tickets, labeled "Door 1"…, and
//     prints them (the codes come back once, in that response, for the print
//     sheet). The door list shows which were handed out ("sold": a mark with
//     the buyer's name; no payment is taken here) and which were used.
//
// Door sales stop at the seat count: audience tickets for one performance may
// not hold more devices than the night (006) or the room has seats, unless an
// admin overbooks. A performance must be scheduled (006) and not over.
//
// Payment is out of scope until Mike decides how (free, pay-what-you-want, a
// tip to the artist, or a Stripe checkout). "Sold" only records a hand-over.

import crypto from 'node:crypto';
import {
  parseIssue, callerAuthority, mayManage, newCode, sha256, isSlug,
} from './tickets.mjs';

export const MAX_LETTERS = 100;
export const MAX_DOOR = 100;
export const DEFAULT_SEATS = 12; // frontrow-server's cap on taken seats
export const DEFAULT_SENDER = 'claude@mike-wolf.com';
export const FROM_DISPLAY = 'Front Row Theater box office';
// Starts with a letter or digit, so an address can never read as a command-line flag.
export const EMAIL_RE = /^[a-z0-9][a-z0-9._%+'-]*@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
// Inboxes an automated agent reads and acts on (soma-zoom-presence offers rule 6).
export const NEVER_SEND = new Set(['claude@mike-wolf.com', 'mikeai@mike-wolf.com']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^frt_[A-Za-z0-9_-]{24}$/;
const B64U = /^[A-Za-z0-9_-]+$/;

const res = (status, body) => ({ status, body });

// No control characters, no angle brackets, whitespace folded, cut to max.
export function cleanLine(v, max) {
  if (typeof v !== 'string') return '';
  return Array.from(v)
    .filter((c) => { const n = c.codePointAt(0); return n >= 32 && n !== 127 && !(n >= 0x80 && n <= 0x9f) && n !== 0x2028 && n !== 0x2029 && c !== '<' && c !== '>'; })
    .join('').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function isTimeZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 60) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

// ── Sealing: X25519 + HKDF-SHA256 + AES-256-GCM, node:crypto only ───────────
// The AAD binds a sealed code to one letter id and one address, so a sealed
// value copied onto another row (or another recipient) will not open.

export function generateMailKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  return { publicKey: publicKey.export({ format: 'jwk' }).x, privateKey: privateKey.export({ format: 'jwk' }).d };
}

const aadFor = (id, email) => Buffer.from(`frontrow-ticket-mail-v1\n${id}\n${email}`);
function keyFor(shared, ephX, pubX) {
  return Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.from(`${ephX}.${pubX}`), 'frontrow-ticket-mail-v1', 32));
}

export function sealCode(code, publicKeyX, id, email) {
  const recipient = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: publicKeyX }, format: 'jwk' });
  const eph = crypto.generateKeyPairSync('x25519');
  const ephX = eph.publicKey.export({ format: 'jwk' }).x;
  const shared = crypto.diffieHellman({ privateKey: eph.privateKey, publicKey: recipient });
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyFor(shared, ephX, publicKeyX), iv);
  c.setAAD(aadFor(id, email));
  const ct = Buffer.concat([c.update(code, 'utf8'), c.final(), c.getAuthTag()]);
  return ['v1', ephX, iv.toString('base64url'), ct.toString('base64url')].join('.');
}

/** Opens a sealed code, or returns null (wrong key, wrong letter, tampered). */
export function unsealCode(sealed, publicKeyX, privateKeyD, id, email) {
  try {
    const [v, ephX, ivS, ctS] = String(sealed).split('.');
    if (v !== 'v1' || ![ephX, ivS, ctS].every((s) => s && B64U.test(s))) return null;
    const mine = crypto.createPrivateKey({ key: { kty: 'OKP', crv: 'X25519', x: publicKeyX, d: privateKeyD }, format: 'jwk' });
    const eph = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: ephX }, format: 'jwk' });
    const shared = crypto.diffieHellman({ privateKey: mine, publicKey: eph });
    const raw = Buffer.from(ctS, 'base64url');
    if (raw.length < 17) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', keyFor(shared, ephX, publicKeyX), Buffer.from(ivS, 'base64url'));
    d.setAAD(aadFor(id, email));
    d.setAuthTag(raw.subarray(raw.length - 16));
    const code = Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]).toString('utf8');
    return CODE.test(code) ? code : null;
  } catch {
    return null;
  }
}

// ── Guest lists ─────────────────────────────────────────────────────────────

/**
 * A pasted guest list → recipients. Entries are lines (or array items) like
 * "Ann Lee <ann@example.com>", "ann@example.com" or "ann@example.com, Ann Lee".
 * Addresses are lower-cased and de-duplicated. Returns {recipients, refused}.
 */
export function parseGuestList(input) {
  const entries = Array.isArray(input)
    ? input.map((x) => (x && typeof x === 'object' ? `${x.name || ''} <${x.email || ''}>` : String(x ?? '')))
    : String(input ?? '').split(/\r?\n|;/);
  const recipients = [];
  const refused = [];
  const seen = new Set();
  for (const raw of entries) {
    const line = String(raw).trim();
    if (!line) continue;
    let email;
    let name;
    const angle = /^(.*)<([^<>]*)>\s*$/.exec(line);
    if (angle) {
      email = angle[2];
      name = angle[1];
    } else {
      const parts = line.split(/[\s,]+/);
      const at = parts.findIndex((p) => p.includes('@'));
      email = at >= 0 ? parts[at] : '';
      name = parts.filter((_, i) => i !== at).join(' ');
    }
    email = String(email).trim().toLowerCase();
    name = cleanLine(String(name).replace(/^["',\s]+|["',\s]+$/g, ''), 80);
    const shown = cleanLine(line, 140);
    if (!EMAIL_RE.test(email) || email.length > 120) { refused.push({ entry: shown, reason: 'not an email address' }); continue; }
    if (NEVER_SEND.has(email)) { refused.push({ entry: shown, reason: 'an automated agent reads that inbox' }); continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    recipients.push({ email, name: name || null });
  }
  return { recipients, refused };
}

// ── The letter (the worker writes it from this; the preview shows it) ──────

/** Validates the non-secret letter fields. Returns {error} or {payload}. */
export function parseLetterFields(body, spec, origin) {
  const theater = cleanLine(body.theaterTitle, 80);
  const show = cleanLine(body.showTitle, 80);
  if (!theater) return { error: 'name the theater for the letter (theaterTitle)' };
  if (!show) return { error: 'name the show for the letter (showTitle)' };
  const tz = body.timeZone || 'America/New_York';
  if (!isTimeZone(tz)) return { error: 'timeZone must be an IANA zone like America/New_York' };
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(origin || '') && !/^http:\/\/localhost(:\d+)?$/.test(origin || '')) {
    return { error: 'this server does not know its own site address' };
  }
  return {
    payload: {
      theater, show, tz, origin,
      validFrom: spec.valid_from, validUntil: spec.valid_until,
      maxDevices: spec.max_devices, role: spec.role, seat: spec.seat || null,
    },
  };
}

function when(iso, tz) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(iso));
}

/** {subject, body}. `code` null = the preview, which shows where the link goes. */
export function composeLetter(p, name, code) {
  const link = code ? `${p.origin}/#ticket=${code}` : `${p.origin}/#ticket=(your own code goes here)`;
  const role = p.role === 'audience' ? 'ticket' : `${p.role} pass`;
  const devices = p.maxDevices === 1
    ? 'It opens the door on one device, so please use it only on the phone or computer you will watch from.'
    : `It opens the door on up to ${p.maxDevices} devices.`;
  const lines = [
    name ? `Dear ${name},` : 'Hello,',
    '',
    `Here is your ${role} for ${p.show} at ${p.theater}.`,
    '',
    `Doors open ${when(p.validFrom, p.tz)}.`,
    `The ticket works until ${when(p.validUntil, p.tz)}.`,
    p.seat ? `Your seat: ${p.seat.replace('seat-', 'seat ')}.` : '',
    '',
    'Your ticket link:',
    link,
    '',
    devices,
    'This link is yours. Anyone who has it can use it, so please do not forward it.',
    '',
    `See you in the house,`,
    `${p.theater}`,
  ].filter((l, i, a) => !(l === '' && a[i - 1] === ''));
  return { subject: `Your ${role}: ${p.show} at ${p.theater}`, body: lines.join('\n') + '\n' };
}

// ── Seats ───────────────────────────────────────────────────────────────────

/** Devices already promised to audience tickets of this exact performance. */
function seatsTaken(tickets, scope) {
  return tickets
    .filter((t) => !t.revoked_at && t.role === 'audience' && t.room_id === scope.room && t.performance_id === scope.performance)
    .reduce((n, t) => n + (Number(t.max_devices) || 1), 0);
}

/** The night being sold (006's performances): refuse one that does not exist
 *  or is over, before anything is minted. Returns {fail} or {night}. */
async function nightFor(scope, deps) {
  if (!scope.performance) return { night: null };
  const r = await deps.rpc('frontrow_box_office_performance', { venue_id: scope.venue, room_id: scope.room, slug: scope.performance });
  if (!r || !r.table) return { night: null }; // 006 not applied: nothing to check against
  if (!r.found) return { fail: res(400, { error: `There is no performance "${scope.performance}" on that screen. Schedule it first.`, reason: 'no-performance' }) };
  if (['after', 'library', 'cancelled'].includes(r.status)) {
    return { fail: res(409, { error: `That performance is ${r.status === 'after' ? 'over' : r.status}; no more tickets.`, reason: 'performance-closed', status: r.status }) };
  }
  return { night: r };
}

async function seatCount(scope, deps, night) {
  if (night && Number.isInteger(night.seats)) return night.seats;
  return deps.seatsFor ? deps.seatsFor(scope) : DEFAULT_SEATS;
}

async function checkSeats(scope, specs, auth, body, deps, night) {
  if (!scope.performance || specs[0].role !== 'audience') return null;
  const seats = await seatCount(scope, deps, night);
  const r = await deps.rpc('frontrow_box_office_list', { venue_id: scope.venue, room_id: scope.room, performance_id: scope.performance });
  const taken = seatsTaken((r && r.tickets) || [], scope);
  const asked = specs.reduce((n, s) => n + s.max_devices, 0);
  if (taken + asked <= seats) return null;
  if (body.overbook === true && auth.any) return null;
  return res(409, {
    error: `That would promise ${taken + asked} seats; the room holds ${seats} and ${taken} are already promised.`,
    seats, taken, asked, reason: 'sold-out',
  });
}

// ── Shared start of every issuing handler ───────────────────────────────────

/** The theater's current screens (definition record), or null when unknown.
 *  Checked through 004's frontrow_ticket_scope_ok, as handleIssue does, and
 *  against the screen list the box office offers (release thread, 2026-11-05). */
async function screenError(scope, deps) {
  const where = await deps.rpc('frontrow_ticket_scope_ok', { venue_id: scope.venue, room_id: scope.room });
  if (!where || !where.ok) {
    return res(400, { error: where && where.reason === 'no-screen' ? 'That theater has no such room' : 'No such theater', reason: 'no-such-screen' });
  }
  if (!scope.room || !deps.screensFor) return null;
  const screens = await deps.screensFor(scope.venue).catch(() => null);
  if (!screens || screens.includes(scope.room)) return null;
  return res(400, { error: `${scope.room} is not a screen of that theater (screens: ${screens.join(', ') || 'none'})`, reason: 'no-such-screen', screens });
}

async function authorize(req, deps, scope) {
  const auth = await callerAuthority(req, deps);
  if (!auth) return { fail: res(401, { error: 'Sign in, or bring a manager ticket' }) };
  return { auth };
}

function siteOrigin(req, deps) {
  return (deps.siteOrigin || req.origin || '').replace(/\/$/, '');
}

/** Everything a preview and a send share. Returns {fail} or the parts. */
async function prepareLetters(req, deps) {
  if (!deps.rpc) return { fail: res(503, { error: 'Tickets are not configured on this server' }) };
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { recipients, refused } = parseGuestList(body.guests);
  if (!recipients.length) return { fail: res(400, { error: 'The guest list has no email addresses we can send to', refused }) };
  if (recipients.length > MAX_LETTERS) return { fail: res(400, { error: `At most ${MAX_LETTERS} letters at a time` }) };
  const now = deps.now ? deps.now() : Date.now();
  const parsed = parseIssue({ ...body, channel: 'sent', holders: recipients.map((r) => r.email), count: undefined }, now);
  if (parsed.error) return { fail: res(400, { error: parsed.error }) };
  const letter = parseLetterFields(body, parsed.specs[0], siteOrigin(req, deps));
  if (letter.error) return { fail: res(400, { error: letter.error }) };
  const { auth, fail } = await authorize(req, deps, parsed.scope);
  if (fail) return { fail };
  const noScreen = await screenError(parsed.scope, deps);
  if (noScreen) return { fail: noScreen };
  const ok = await mayManage(auth, parsed.scope, deps, { role: parsed.specs[0].role, validUntil: parsed.validUntil });
  if (!ok) return { fail: res(403, { error: 'You do not manage that venue, room or performance' }) };
  const { night, fail: noNight } = await nightFor(parsed.scope, deps);
  if (noNight) return { fail: noNight };
  const full = await checkSeats(parsed.scope, parsed.specs, auth, body, deps, night);
  if (full) return { fail: full };
  return { body, recipients, refused, parsed, payload: letter.payload, auth };
}

const sender = (deps) => ({ email: deps.mailSender || DEFAULT_SENDER, display: FROM_DISPLAY });

// ── Handlers. Same shape as tickets.mjs: (req, deps) → {status, body}. ──────
// deps adds: mailPublicKey (X25519 x, base64url), mailSender?, siteOrigin?,
// seatsFor?(scope), workerToken?, serviceKey? (for the token check), randomUUID?

/** POST /api/box-office-preview. Issues nothing; says exactly who would get what. */
export async function handleMailPreview(req, deps) {
  const p = await prepareLetters(req, deps);
  if (p.fail) return p.fail;
  const sample = composeLetter(p.payload, p.recipients[0].name, null);
  return res(200, {
    ok: true,
    recipients: p.recipients,
    refused: p.refused,
    sender: sender(deps),
    subject: sample.subject,
    sample: sample.body,
    mailReady: !!deps.mailPublicKey,
  });
}

/** POST /api/box-office-send. Body as preview, plus `shown`: the addresses the
 *  manager confirmed. Issues the tickets and queues one sealed letter each. */
export async function handleMailSend(req, deps) {
  if (!deps.mailPublicKey) return res(503, { error: 'Ticket mail is not set up on this server (no worker key); nothing was issued' });
  const p = await prepareLetters(req, deps);
  if (p.fail) return p.fail;
  const shown = Array.isArray(p.body.shown) ? p.body.shown.map((e) => String(e).trim().toLowerCase()) : null;
  const mine = p.recipients.map((r) => r.email);
  if (!shown || [...shown].sort().join(',') !== [...mine].sort().join(',')) {
    return res(409, { error: 'The recipients changed since you confirmed them; nothing was sent. Check the list again.', recipients: p.recipients, reason: 'not-confirmed' });
  }
  const uuid = deps.randomUUID || crypto.randomUUID;
  const batch = uuid();
  const codes = p.parsed.specs.map(() => newCode());
  const ids = p.recipients.map(() => uuid());
  const r = await deps.rpc('frontrow_box_office_issue', {
    issued_by: p.auth.who,
    tickets: p.parsed.specs.map((s, i) => ({ ...s, code_hash: sha256(codes[i]) })),
    mail: p.recipients.map((rc, i) => ({
      id: ids[i], batch_id: batch, index: i, email: rc.email, name: rc.name,
      sealed: sealCode(codes[i], deps.mailPublicKey, ids[i], rc.email),
      payload: p.payload,
    })),
  });
  if (!r || !r.ok) return res(500, { error: 'Could not issue tickets' });
  const byHash = new Map(r.tickets.map((t) => [t.code_hash, t.id]));
  return res(200, {
    ok: true,
    batch,
    sender: sender(deps),
    // No codes: only the recipient ever sees theirs.
    letters: p.recipients.map((rc, i) => ({ id: ids[i], email: rc.email, name: rc.name, ticket: byHash.get(sha256(codes[i])), state: 'queued' })),
  });
}

/** POST /api/box-office-door: {venue, room, performance?, role?, validFrom,
 *  validUntil, count, overbook?}. Door cards, labeled after the last one. The
 *  codes come back once, for the print sheet. */
export async function handleDoor(req, deps) {
  if (!deps.rpc) return res(503, { error: 'Tickets are not configured on this server' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const count = Number(body.count);
  if (!Number.isInteger(count) || count < 1 || count > MAX_DOOR) return res(400, { error: `count must be 1 to ${MAX_DOOR}` });
  const now = deps.now ? deps.now() : Date.now();
  const parsed = parseIssue({ ...body, role: 'audience', channel: 'door', holders: undefined, count, seat: null, maxDevices: 1 }, now);
  if (parsed.error) return res(400, { error: parsed.error });
  if (!parsed.scope.room) return res(400, { error: 'door codes name their room' });
  const { auth, fail } = await authorize(req, deps, parsed.scope);
  if (fail) return fail;
  const noScreen = await screenError(parsed.scope, deps);
  if (noScreen) return noScreen;
  if (!(await mayManage(auth, parsed.scope, deps, { role: parsed.specs[0].role, validUntil: parsed.validUntil }))) {
    return res(403, { error: 'You do not manage that venue, room or performance' });
  }
  const { night, fail: noNight } = await nightFor(parsed.scope, deps);
  if (noNight) return noNight;
  const full = await checkSeats(parsed.scope, parsed.specs, auth, body, deps, night);
  if (full) return full;
  const existing = await deps.rpc('frontrow_box_office_list', {
    venue_id: parsed.scope.venue, room_id: parsed.scope.room, performance_id: parsed.scope.performance,
  });
  const last = ((existing && existing.tickets) || [])
    .map((t) => /^Door (\d+)$/.exec(t.label || ''))
    .filter(Boolean)
    .reduce((n, m) => Math.max(n, Number(m[1])), 0);
  const codes = parsed.specs.map(() => newCode());
  const labels = parsed.specs.map((_, i) => `Door ${last + i + 1}`);
  const r = await deps.rpc('frontrow_box_office_issue', {
    issued_by: auth.who,
    tickets: parsed.specs.map((s, i) => ({ ...s, code_hash: sha256(codes[i]), label: labels[i] })),
    mail: [],
  });
  if (!r || !r.ok) return res(500, { error: 'Could not issue door codes' });
  const byHash = new Map(r.tickets.map((t) => [t.code_hash, t.id]));
  const origin = siteOrigin(req, deps);
  return res(200, {
    ok: true,
    // Shown once, here, for printing. The database keeps only their hashes.
    cards: codes.map((code, i) => ({
      id: byHash.get(sha256(code)), label: labels[i], code, link: `${origin}/#ticket=${code}`,
    })),
    scope: parsed.scope, validFrom: parsed.specs[0].valid_from, validUntil: parsed.specs[0].valid_until,
  });
}

/** GET /api/box-office-list?venue=&room=&performance=: the box office's view. */
export async function handleBoxList(req, deps) {
  if (!deps.rpc) return res(503, { error: 'Tickets are not configured on this server' });
  const q = req.query || {};
  const scope = { venue: q.venue, room: q.room || null, performance: q.performance || null };
  if (!isSlug(scope.venue, 40) || (scope.room && !isSlug(scope.room)) || (scope.performance && !isSlug(scope.performance, 60))) {
    return res(400, { error: 'venue (and optional room, performance) must be slugs' });
  }
  const { auth, fail } = await authorize(req, deps, scope);
  if (fail) return fail;
  if (!(await mayManage(auth, scope, deps))) return res(403, { error: 'You do not manage that scope' });
  const r = await deps.rpc('frontrow_box_office_list', { venue_id: scope.venue, room_id: scope.room, performance_id: scope.performance });
  const tickets = (r && r.tickets) || [];
  const live = tickets.filter((t) => !t.revoked_at);
  const now = deps.now ? deps.now() : Date.now();
  const w = r && r.worker;
  const seen = w && Date.parse(w.last_seen_at);
  const summary = {
    sent: live.filter((t) => t.channel === 'sent').length,
    delivered: live.filter((t) => t.mail && t.mail.state === 'sent').length,
    waiting: live.filter((t) => t.mail && (t.mail.state === 'queued' || t.mail.state === 'sending')).length,
    notSent: live.filter((t) => t.mail && t.mail.state === 'failed').length,
    door: live.filter((t) => t.channel === 'door').length,
    doorSold: live.filter((t) => t.channel === 'door' && t.sold_at).length,
    used: live.filter((t) => Number(t.claimed) > 0).length,
  };
  let night = null;
  if (scope.room && scope.performance) {
    night = (await nightFor(scope, deps)).night || null;
    summary.seats = await seatCount(scope, deps, night);
    summary.seatsPromised = seatsTaken(tickets, scope);
  }
  return res(200, {
    ok: true, tickets, summary, sender: sender(deps), mailReady: !!deps.mailPublicKey,
    screens: deps.screensFor ? await deps.screensFor(scope.venue).catch(() => null) : null,
    performance: night ? { slug: night.slug, title: night.title, artist: night.artist, status: night.status, seats: night.seats, startsAt: night.starts_at, doorsAt: night.doors_at, endsAt: night.ends_at } : null,
    worker: w ? {
      host: w.host, armed: !!w.armed, lastSeenAt: w.last_seen_at,
      // The worker polls every 30 s; three missed polls = not connected.
      connected: Number.isFinite(seen) && now - seen < 120e3,
    } : null,
  });
}

async function ticketScope(deps, id) {
  const got = await deps.rpc('frontrow_ticket_get', { id });
  if (!got || !got.ok) return null;
  return { venue: got.ticket.venue_id, room: got.ticket.room_id || null, performance: got.ticket.performance_id || null };
}

/** POST /api/box-office-sold: {id, sold: true|false, note?}. A door card was
 *  handed to someone (note = their name), or the mark is taken back. */
export async function handleSold(req, deps) {
  if (!deps.rpc) return res(503, { error: 'Tickets are not configured on this server' });
  const b = req.body || {};
  if (typeof b.id !== 'string' || !UUID.test(b.id)) return res(400, { error: 'id must be a ticket id' });
  if (typeof b.sold !== 'boolean') return res(400, { error: 'sold must be true or false' });
  const { auth, fail } = await authorize(req, deps);
  if (fail) return fail;
  const scope = await ticketScope(deps, b.id);
  if (!scope) return res(404, { error: 'No such ticket' });
  if (!(await mayManage(auth, scope, deps))) return res(403, { error: 'You do not manage that ticket' });
  const r = await deps.rpc('frontrow_box_office_sold', { id: b.id, sold: b.sold, by: auth.who, note: cleanLine(b.note, 80) });
  if (!r || !r.ok) return res(409, { error: r && r.reason === 'not-door' ? 'Only door cards are marked sold' : 'Could not mark it', reason: r && r.reason });
  return res(200, { ok: true, id: b.id, sold: b.sold });
}

/** POST /api/box-office-retry: {id} (a letter id). A failed letter goes back in the queue. */
export async function handleRetry(req, deps) {
  if (!deps.rpc) return res(503, { error: 'Tickets are not configured on this server' });
  const id = req.body && req.body.id;
  if (typeof id !== 'string' || !UUID.test(id)) return res(400, { error: 'id must be a letter id' });
  const { auth, fail } = await authorize(req, deps);
  if (fail) return fail;
  const got = await deps.rpc('frontrow_mail_get', { id });
  if (!got || !got.ok) return res(404, { error: 'No such letter' });
  const scope = { venue: got.ticket.venue_id, room: got.ticket.room_id || null, performance: got.ticket.performance_id || null };
  if (!(await mayManage(auth, scope, deps))) return res(403, { error: 'You do not manage that ticket' });
  const r = await deps.rpc('frontrow_mail_retry', { id });
  if (!r || !r.ok) {
    const why = { 'not-failed': 'That letter has not failed', revoked: 'That ticket was revoked', closed: 'That ticket can no longer be sent; issue a new one' };
    return res(409, { error: why[r && r.reason] || 'Could not retry', reason: r && r.reason });
  }
  return res(200, { ok: true, id });
}

// ── The Mac worker's side ───────────────────────────────────────────────────

/** The worker's own token. Refused when unset, short, or equal to the service key. */
export function workerAllowed(authHeader, deps) {
  const want = String(deps.workerToken || '');
  if (want.length < 32 || (deps.serviceKey && want === deps.serviceKey)) return { ok: false, status: 503, error: 'The ticket mail worker is not set up on this server' };
  const got = String(authHeader || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(sha256(got));
  const b = Buffer.from(sha256(want));
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, status: 401, error: 'Not the mail worker' };
  return { ok: true };
}

/** GET /api/mail-work?limit=&host=&armed=: check in, and take queued letters. */
export async function handleWorkerClaim(req, deps) {
  if (!deps.rpc) return res(503, { error: 'Tickets are not configured on this server' });
  const w = workerAllowed(req.authorization, deps);
  if (!w.ok) return res(w.status, { error: w.error });
  const q = req.query || {};
  const armed = q.armed === '1';
  const limit = armed ? Math.min(Math.max(Number(q.limit) || 5, 0), 20) : 0;
  const r = await deps.rpc('frontrow_mail_claim', {
    limit, host: cleanLine(q.host, 80) || 'unknown', armed,
    wait_seconds: deps.mailWaitSeconds || 6 * 3600, stale_seconds: 900,
  });
  return res(200, { ok: true, jobs: (r && r.jobs) || [] });
}

/** POST /api/mail-work: {id, ok, error?}. */
export async function handleWorkerReport(req, deps) {
  if (!deps.rpc) return res(503, { error: 'Tickets are not configured on this server' });
  const w = workerAllowed(req.authorization, deps);
  if (!w.ok) return res(w.status, { error: w.error });
  const b = req.body || {};
  if (typeof b.id !== 'string' || !UUID.test(b.id) || typeof b.ok !== 'boolean') return res(400, { error: 'id and ok' });
  const r = await deps.rpc('frontrow_mail_report', { id: b.id, ok: b.ok, error: cleanLine(b.error, 300) });
  return res(200, { ok: !!(r && r.ok) });
}
