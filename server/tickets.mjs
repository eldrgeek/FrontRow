// Front Row tickets: the shared core behind the Netlify functions
// (netlify/functions/ticket-*.ts, get-livekit-token.ts) and frontrow-server's
// /api/livekit-token. One copy of the rules, so the two token mints cannot drift.
//
// A ticket is a revocable grant stored in Supabase (migrations/004). Holders
// carry a bearer code; the database keeps only sha256(code). Every request
// re-reads the ticket, so a revoke takes effect on the next token request.
//
// No dependencies beyond node:crypto and fetch: callers pass in the Supabase
// RPC caller, the user lookup, the admin check and LiveKit's AccessToken.

import crypto from 'node:crypto';

// FrontRow admins by email, the fallback tier behind is_app_admin /
// is_frontrow_admin (netlify/functions/lib/appAdmin.ts imports this list).
export const ADMIN_EMAILS = [
  'mw@mike-wolf.com',
  'mike@embeddedsystemsresearch.org',
  'dwjessop@gmail.com',
  'gtcoveney@gmail.com',
];

export const ROLES = ['audience', 'performer', 'crew', 'manager'];
export const CHANNELS = ['sent', 'door', 'comp'];
export const MAX_BATCH = 200;
const MAX_WINDOW_MS = 400 * 24 * 3600 * 1000;
const TOKEN_TTL_MAX_S = 2 * 3600;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const isSlug = (s, max = 40) => typeof s === 'string' && s.length <= max && SLUG.test(s);
const SEAT = /^seat-\d{1,2}$/;
const CODE = /^frt_[A-Za-z0-9_-]{24}$/;
const DEVICE = /^[A-Za-z0-9_-]{16,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// LiveKit keys are not scoped to rooms, so a token minted here could join any
// room on the server. FrontRow only uses frontrow-* rooms.
export const ROOM_PATTERN = /^frontrow-[a-z0-9-]{1,100}$/;

// LiveKit room names. A kit room is frontrow-<venue>--<room> (slugs never hold
// "--", so the split is unambiguous). Rooms that existed before the kit keep
// their names through this table.
export const ROOM_ALIASES = {
  'frontrow-main': { venue: 'front-row', room: 'live' },
};

export function livekitRoomFor(venue, room) {
  for (const [name, a] of Object.entries(ROOM_ALIASES)) {
    if (a.venue === venue && a.room === room) return name;
  }
  return `frontrow-${venue}--${room}`;
}

export function parseLivekitRoom(name) {
  if (ROOM_ALIASES[name]) return { ...ROOM_ALIASES[name] };
  const m = /^frontrow-([a-z0-9-]+)--([a-z0-9-]+)$/.exec(name || '');
  if (!m || !isSlug(m[1], 40) || !isSlug(m[2])) return null;
  return { venue: m[1], room: m[2] };
}

export const newCode = () => 'frt_' + crypto.randomBytes(18).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const isCode = (s) => typeof s === 'string' && CODE.test(s);
export const isDevice = (s) => typeof s === 'string' && DEVICE.test(s);

/** Performers join as "performer-<id>" (the ticket's or the admin's id), so a
 *  trio is three identities and every seat watches all of them. Joining under
 *  an identity already in the room evicts the first one, so nobody else may
 *  take "performer" or any "performer-…" name. */
export const isReservedIdentity = (s) => /^performer(-|$)/i.test(String(s || '').trim());
const SOURCE_ENUM = { camera: 'CAMERA', microphone: 'MICROPHONE', screen_share: 'SCREEN_SHARE', screen_share_audio: 'SCREEN_SHARE_AUDIO' };
/** LiveKit's TrackSource enum values for a role (the SDK takes enums, not names). */
function publishSources(TrackSource, role) {
  if (!TrackSource) throw new Error('TrackSource missing from deps');
  return (PUBLISH_SOURCES[role] || PUBLISH_SOURCES.audience).map((n) => TrackSource[SOURCE_ENUM[n]]);
}
/** A performer device name: short lowercase letters and digits. */
const CAM = /^[a-z0-9]{1,12}$/;
const performerIdentity = (id) => `performer-${String(id).replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase()}`;

/** What each role may publish. Audience publish only their seat camera (the
 *  house sees itself); performers, crew and managers publish everything. */
export const PUBLISH_SOURCES = {
  audience: ['camera'],
  performer: ['camera', 'microphone', 'screen_share', 'screen_share_audio'],
  crew: ['camera', 'microphone', 'screen_share', 'screen_share_audio'],
  manager: ['camera', 'microphone', 'screen_share', 'screen_share_audio'],
};

function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  return Array.from(v)
    .filter((c) => { const n = c.codePointAt(0); return n >= 32 && n !== 127 && c !== '<' && c !== '>'; })
    .join('').replace(/\s+/g, ' ').trim().slice(0, max);
}
export const cleanIdentity = (v) => cleanText(v, 40) || 'Guest';

/** Does scope `outer` contain scope `inner`? A scope is {venue, room?, performance?}. */
export function scopeCovers(outer, inner) {
  if (!outer || !inner || outer.venue !== inner.venue) return false;
  if (outer.room && outer.room !== inner.room) return false;
  if (outer.performance && outer.performance !== inner.performance) return false;
  return true;
}

const fromRow = (t) => ({
  venue: t.venue_id, room: t.room_id || null, performance: t.performance_id || null,
});

export function ticketSummary(t) {
  return {
    id: t.id, role: t.role, venue: t.venue_id, room: t.room_id || null,
    performance: t.performance_id || null, seat: t.seat || null, holder: t.holder || null,
    validFrom: t.valid_from, validUntil: t.valid_until,
  };
}

/** Supabase RPC caller (service role). Every ticket function takes one jsonb arg `p`. */
export function makeRpc({ url, serviceKey, fetchImpl = fetch }) {
  if (!url || !serviceKey) return null;
  return async (fn, p) => {
    const resp = await fetchImpl(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p }),
    });
    if (!resp.ok) {
      const detail = (await resp.text().catch(() => '')).slice(0, 300);
      throw new Error(`rpc ${fn} failed: ${resp.status} ${detail}`);
    }
    return resp.json();
  };
}

// ── Issue-request validation ────────────────────────────────────────────────

function parseTime(v) {
  const ms = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * Validate an issue request. body: {venue, room?, performance?, role, validFrom,
 * validUntil, maxDevices?, seat?, channel, holders?: string[], count?}.
 * One ticket per holder, or `count` unnamed ones. Returns {error} or {scope, specs}.
 */
export function parseIssue(body, now = Date.now()) {
  const b = body && typeof body === 'object' ? body : {};
  const scope = { venue: b.venue, room: b.room ?? null, performance: b.performance ?? null };
  if (!isSlug(scope.venue, 40)) return { error: 'venue must be a theater slug' };
  if (scope.room !== null && !isSlug(scope.room)) return { error: 'room must be a screen slug' };
  if (scope.performance !== null && !isSlug(scope.performance, 60)) return { error: 'performance must be a show slug' };
  if (scope.performance && !scope.room) return { error: 'a performance ticket names its room' };
  if (!ROLES.includes(b.role)) return { error: `role must be one of ${ROLES.join(', ')}` };
  if (!CHANNELS.includes(b.channel)) return { error: `channel must be one of ${CHANNELS.join(', ')}` };
  const from = parseTime(b.validFrom);
  const until = parseTime(b.validUntil);
  if (!Number.isFinite(from) || !Number.isFinite(until)) return { error: 'validFrom and validUntil must be times' };
  if (until <= from) return { error: 'validUntil must be after validFrom' };
  if (until <= now) return { error: 'that window has already closed' };
  if (until - from > MAX_WINDOW_MS) return { error: 'a ticket window is at most 400 days' };
  const maxDevices = b.maxDevices === undefined ? 1 : Number(b.maxDevices);
  if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 1000) return { error: 'maxDevices must be 1 to 1000' };
  const seat = b.seat ?? null;
  if (seat !== null && !SEAT.test(seat)) return { error: 'seat must look like seat-3' };

  let holders;
  if (Array.isArray(b.holders) && b.holders.length) {
    holders = b.holders.map((h) => cleanText(h, 120));
    if (holders.some((h) => !h)) return { error: 'every holder needs a name or email' };
  } else {
    const count = b.count === undefined ? 1 : Number(b.count);
    if (!Number.isInteger(count) || count < 1) return { error: 'count must be a whole number' };
    holders = Array(count).fill(null);
  }
  if (holders.length > MAX_BATCH) return { error: `at most ${MAX_BATCH} tickets at a time` };
  if (seat && holders.length > 1) return { error: 'a reserved seat goes on one ticket' };

  const specs = holders.map((holder) => ({
    venue_id: scope.venue, room_id: scope.room, performance_id: scope.performance,
    role: b.role, valid_from: new Date(from).toISOString(), valid_until: new Date(until).toISOString(),
    max_devices: maxDevices, holder, seat, channel: b.channel,
  }));
  return { scope, specs, validUntil: until };
}

// ── Authority: who may issue, list and revoke ───────────────────────────────

/**
 * Work out what the caller may manage. Returns one of:
 *   {who, any:true}                       a FrontRow admin
 *   {who, user, managerCheck:true}         signed in; theater manager checked per venue
 *   {who, scope, until, canIssueManager:false}   a delegated manager ticket
 *   null                                  nobody
 */
export async function callerAuthority(req, deps) {
  if (req.authorization) {
    const user = await deps.getUser(req.authorization).catch(() => null);
    if (user) {
      if (await deps.isAdmin(user).catch(() => false)) return { who: user.email || user.id, any: true, user };
      // A signed-in delegate who also brings a manager ticket acts on the ticket.
      if (!req.ticket) return { who: user.email || user.id, user, managerCheck: true };
    }
  }
  if (req.ticket && req.device && isCode(req.ticket) && isDevice(req.device)) {
    const r = await deps.rpc('frontrow_ticket_redeem', {
      code_hash: sha256(req.ticket), device_hash: sha256(req.device), purpose: 'manage',
    });
    if (r && r.ok) {
      return {
        who: `ticket:${r.ticket.id}`, scope: fromRow(r.ticket),
        until: Date.parse(r.ticket.valid_until),
      };
    }
  }
  return null;
}

/** May this authority act on `scope`? For issuing, also checks role and window. */
export async function mayManage(auth, scope, deps, issue) {
  if (!auth) return false;
  if (auth.any) return true;
  if (auth.managerCheck) {
    const r = await deps.rpc('frontrow_ticket_can_manage', { user_id: auth.user.id, venue_id: scope.venue });
    return !!(r && (r.admin || r.manager));
  }
  if (!scopeCovers(auth.scope, scope)) return false;
  if (issue) {
    if (issue.role === 'manager') return false; // a delegated manager cannot mint managers
    if (issue.validUntil > auth.until) return false;
  }
  return true;
}

const res = (status, body) => ({ status, body });

// ── Handlers. Each takes a plain request and returns {status, body}. ────────
// req: {authorization?, ticket?, device?, body?, query?, origin?}
// deps: {rpc, getUser, isAdmin, now?}

export async function handleIssue(req, deps) {
  if (!deps.rpc) return res(503, { error: 'Tickets are not configured on this server' });
  const parsed = parseIssue(req.body, deps.now ? deps.now() : Date.now());
  if (parsed.error) return res(400, { error: parsed.error });
  const auth = await callerAuthority(req, deps);
  if (!auth) return res(401, { error: 'Sign in, or bring a manager ticket' });
  const ok = await mayManage(auth, parsed.scope, deps, { role: parsed.specs[0].role, validUntil: parsed.validUntil });
  if (!ok) return res(403, { error: 'You do not manage that venue, room or performance' });
  const where = await deps.rpc('frontrow_ticket_scope_ok', { venue_id: parsed.scope.venue, room_id: parsed.scope.room });
  if (!where || !where.ok) {
    return res(400, { error: where && where.reason === 'no-screen' ? 'That theater has no such room' : 'No such theater' });
  }

  const codes = parsed.specs.map(() => newCode());
  const r = await deps.rpc('frontrow_ticket_issue', {
    issued_by: auth.who,
    tickets: parsed.specs.map((s, i) => ({ ...s, code_hash: sha256(codes[i]) })),
  });
  if (!r || !r.ok) return res(500, { error: 'Could not issue tickets' });
  const byHash = new Map(r.tickets.map((t) => [t.code_hash, t.id]));
  const origin = req.origin || '';
  return res(200, {
    ok: true,
    // The codes are shown once, here. The database keeps only their hashes.
    tickets: parsed.specs.map((s, i) => ({
      id: byHash.get(sha256(codes[i])),
      code: codes[i],
      // A fragment, so the code never reaches a server log or a Referer.
      link: `${origin}/#ticket=${codes[i]}`,
      holder: s.holder, role: s.role, seat: s.seat,
    })),
  });
}

export async function handleList(req, deps) {
  if (!deps.rpc) return res(503, { error: 'Tickets are not configured on this server' });
  const q = req.query || {};
  const scope = { venue: q.venue, room: q.room || null, performance: q.performance || null };
  if (!isSlug(scope.venue, 40) || (scope.room && !isSlug(scope.room)) || (scope.performance && !isSlug(scope.performance, 60))) {
    return res(400, { error: 'venue (and optional room, performance) must be slugs' });
  }
  const auth = await callerAuthority(req, deps);
  if (!auth) return res(401, { error: 'Sign in, or bring a manager ticket' });
  if (!(await mayManage(auth, scope, deps))) return res(403, { error: 'You do not manage that scope' });
  const r = await deps.rpc('frontrow_ticket_list', {
    venue_id: scope.venue, room_id: scope.room, performance_id: scope.performance,
  });
  return res(200, { ok: true, tickets: (r && r.tickets) || [] });
}

export async function handleRevoke(req, deps) {
  if (!deps.rpc) return res(503, { error: 'Tickets are not configured on this server' });
  const id = req.body && req.body.id;
  if (typeof id !== 'string' || !UUID.test(id)) return res(400, { error: 'id must be a ticket id' });
  const auth = await callerAuthority(req, deps);
  if (!auth) return res(401, { error: 'Sign in, or bring a manager ticket' });
  const got = await deps.rpc('frontrow_ticket_get', { id });
  if (!got || !got.ok) return res(404, { error: 'No such ticket' });
  if (!(await mayManage(auth, fromRow(got.ticket), deps))) return res(403, { error: 'You do not manage that ticket' });
  await deps.rpc('frontrow_ticket_revoke', { id, revoked_by: auth.who });
  return res(200, { ok: true, id });
}

/** The lobby asks "will my ticket let this device in, and when?" Changes nothing. */
export async function handleCheck(req, deps) {
  if (!deps.rpc) return res(503, { error: 'Tickets are not configured on this server' });
  if (!isCode(req.ticket) || !isDevice(req.device)) return res(400, { ok: false, reason: 'bad-request' });
  const r = await deps.rpc('frontrow_ticket_redeem', {
    code_hash: sha256(req.ticket), device_hash: sha256(req.device), purpose: 'check',
  });
  if (!r || !r.ok) return res(200, { ok: false, reason: (r && r.reason) || 'unknown', validFrom: r && r.valid_from });
  return res(200, { ok: true, ticket: ticketSummary(r.ticket) });
}

/**
 * The LiveKit token mint. req.query: {identity, role, room, performance?};
 * req.ticket / req.device: the guest's ticket and device id, if any.
 * deps also: AccessToken, livekitKey, livekitSecret, mode ('stage' | 'all').
 *
 *   A ticket, or a signed-in FrontRow admin, is needed for any role but
 *   audience and for any performer identity. A ticketless guest gets an
 *   audience token only for a theater room (frontrow-<venue>--<room> or an
 *   alias) whose frontrow_room_mode is 'open'; a ticketed theater refuses them.
 *   mode 'all' (FRONTROW_TICKETS=all) refuses every ticketless guest.
 */
export async function handleToken(req, deps) {
  const q = req.query || {};
  const room = String(q.room || 'frontrow-main');
  if (!ROOM_PATTERN.test(room)) return res(403, { error: 'Room not allowed' });
  if (!deps.livekitKey || !deps.livekitSecret) {
    return res(500, { error: 'Server misconfigured: missing LiveKit credentials' });
  }
  const now = deps.now ? deps.now() : Date.now();
  const askedRole = ROLES.includes(q.role) ? q.role : 'audience';
  let identity = cleanIdentity(q.identity);
  let role;
  let until = now + TOKEN_TTL_MAX_S * 1000;
  let ticket = null;
  let performerId = null;

  if (req.ticket) {
    if (!deps.rpc) return res(503, { error: 'Tickets are not configured on this server' });
    if (!isCode(req.ticket) || !isDevice(req.device)) return res(400, { error: 'Bad ticket', reason: 'bad-request' });
    const where = parseLivekitRoom(room);
    if (!where) return res(403, { error: 'No ticket covers this room', reason: 'wrong-room' });
    let user = null;
    if (req.authorization) user = await deps.getUser(req.authorization).catch(() => null);
    const p = {
      code_hash: sha256(req.ticket), device_hash: sha256(req.device), purpose: 'enter',
      venue_id: where.venue, room_id: where.room,
    };
    if (isSlug(q.performance, 60)) p.performance_id = q.performance;
    if (user && UUID.test(user.id)) p.user_id = user.id;
    const r = await deps.rpc('frontrow_ticket_redeem', p);
    if (!r || !r.ok) {
      return res(403, { error: 'This ticket does not open that door', reason: (r && r.reason) || 'unknown', validFrom: r && r.valid_from });
    }
    ticket = ticketSummary(r.ticket);
    role = r.ticket.role;
    performerId = r.ticket.id;
    until = Math.min(until, Date.parse(r.ticket.valid_until));
  } else {
    let admin = false;
    let adminUser = null;
    if (req.authorization) {
      const user = await deps.getUser(req.authorization).catch(() => null);
      admin = !!user && (await deps.isAdmin(user).catch(() => false));
      if (admin) adminUser = user;
    }
    if (admin) {
      role = askedRole;
      if (role === 'performer') performerId = adminUser.id;
    } else if (askedRole !== 'audience' || isReservedIdentity(identity)) {
      return res(403, { error: 'Only a performer ticket or a FrontRow admin can join as the performer', reason: 'ticket-required' });
    } else {
      // Ticketless audience: only into a theater room whose theater is open.
      const where = parseLivekitRoom(room);
      if (!where) return res(403, { error: 'That room is not a theater room', reason: 'ticket-required' });
      if (deps.mode === 'all') return res(401, { error: 'A ticket is needed to come in', reason: 'ticket-required' });
      if (deps.rpc) {
        let mode;
        try {
          const m = await deps.rpc('frontrow_room_mode', { venue_id: where.venue, room_id: where.room });
          mode = m && m.mode;
        } catch {
          return res(503, { error: 'Could not check whether this theater is open', reason: 'unavailable' });
        }
        if (mode !== 'open') return res(401, { error: 'This performance is ticketed', reason: 'ticket-required' });
      }
      role = 'audience';
    }
  }

  // Performers are performer-<id>; nobody else may take a performer name.
  // A performer's second device (cam=stage: a phone on the boards) is
  // performer-<id>-<cam>, so it joins beside the first instead of evicting it.
  if (role === 'performer') identity = performerIdentity(performerId) + (CAM.test(q.cam || '') ? `-${q.cam}` : '');
  else if (isReservedIdentity(identity)) identity = 'Guest';

  const ttl = Math.max(60, Math.floor((until - now) / 1000));
  const at = new deps.AccessToken(deps.livekitKey, deps.livekitSecret, {
    identity, name: identity, ttl,
    metadata: JSON.stringify({ role, ticket: ticket ? ticket.id : null, seat: ticket ? ticket.seat : null }),
  });
  at.addGrant({
    roomJoin: true, room,
    canPublish: true, canPublishSources: publishSources(deps.TrackSource, role), canSubscribe: true, canPublishData: true,
  });
  const token = await at.toJwt();
  const body = { token, role, identity };
  if (ticket) body.ticket = ticket;
  return res(200, body);
}

/** Admin check by email, then is_frontrow_admin via the service role. For frontrow-server. */
export function makeIsAdmin(rpcLike) {
  return async (user) => {
    if (!user) return false;
    if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) return true;
    if (!rpcLike) return false;
    const r = await rpcLike('frontrow_ticket_can_manage', { user_id: user.id, venue_id: '' }).catch(() => null);
    return !!(r && r.admin);
  };
}

/** Supabase /auth/v1/user lookup for a bearer header. */
export function makeGetUser({ url, anonKey, fetchImpl = fetch }) {
  return async (authHeader) => {
    const token = String(authHeader || '').replace(/^Bearer\s+/i, '').trim();
    if (!token || !url || !anonKey) return null;
    const resp = await fetchImpl(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
    if (!resp.ok) return null;
    const u = await resp.json();
    return u && u.id ? { id: u.id, email: u.email || null, token } : null;
  };
}
