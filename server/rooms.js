// Per-room runtime for frontrow-server (theater kit, 2026-11-05).
//
// A kit theater has several screens, and each screen is its own house: its own
// seats, its own show state, its own post-show chat. A house is named by the
// theater's slug (venue) and the screen's slug (room), the same pair that ticket
// grants use (server/tickets.mjs, PR #6). Each house is one Socket.io room, so a
// broadcast in one never reaches another.
//
// The LiveKit room name follows tickets.mjs livekitRoomFor: frontrow-<venue>--<room>,
// with frontrow-main kept as the name of Front Row's live screen. Keep the two in
// step; scripts/rooms-selftest.mjs checks them against each other when both exist.

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const isSlug = (s, max = 40) => typeof s === 'string' && s.length <= max && SLUG.test(s);

const DEFAULT_SCOPE = Object.freeze({ venue: 'front-row', room: 'live' });

// Rooms that existed before the kit keep their LiveKit names (tickets.mjs ROOM_ALIASES).
const ROOM_ALIASES = {
  'frontrow-main': { venue: 'front-row', room: 'live' },
};

/** The most seats any one house may hold (lib/seatLayout.ts caps layouts at 99). */
const SEAT_CAP = 99;

function livekitRoomFor(venue, room) {
  for (const [name, a] of Object.entries(ROOM_ALIASES)) {
    if (a.venue === venue && a.room === room) return name;
  }
  return `frontrow-${venue}--${room}`;
}

function scopeKey(scope) {
  return `${scope.venue}--${scope.room}`;
}

/**
 * Reads { venue, room } from a handshake query or a request (query or body).
 * Missing values mean Front Row's live screen, so clients that predate the kit
 * keep working. A malformed value is refused (null), never coerced.
 * `room` may also be a LiveKit name (frontrow-main or frontrow-<venue>--<room>).
 */
function parseScope(src) {
  const pick = (k) => {
    const v = src && src[k];
    return Array.isArray(v) ? v[0] : v;
  };
  let venue = pick('venue') ?? pick('theater');
  let room = pick('room') ?? pick('screen');
  if (venue === undefined && typeof room === 'string' && room.startsWith('frontrow-')) {
    if (ROOM_ALIASES[room]) return { ...ROOM_ALIASES[room] };
    const m = /^frontrow-([a-z0-9-]+)--([a-z0-9-]+)$/.exec(room);
    if (!m) return null;
    venue = m[1];
    room = m[2];
  }
  if (venue === undefined || venue === '') venue = DEFAULT_SCOPE.venue;
  if (room === undefined || room === '') room = DEFAULT_SCOPE.room;
  if (!isSlug(venue, 40) || !isSlug(room, 40)) return null;
  return { venue, room };
}

/** A complete show state. Every reset uses this, so no handler meets a partial one. */
function newShowState() {
  return {
    artistId: null,
    startTime: null,
    status: 'idle', // 'idle', 'pre-show', 'live', 'post-show'
    audienceSeats: {}, // { seatId: { name, imageUrl, socketId, captureMode, hasVideoStream } }
    countdown: { isActive: false, timeRemaining: 0, totalTime: 0, interval: null },
    venueConfig: {
      seatCount: 20,
      arrangement: 'semicircle',
      curtainStyle: 'velvet-red',
      showTitle: '',
      scheduledStart: null,
      curtainOpen: false,
      configLocked: false,
    },
    backstageClients: {},
    reactions: [],
    performerOnStage: false,
    performerPosition: { x: 0, z: -8 },
    spotlightActive: false,
  };
}

function clampSeats(n, fallback) {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1) return fallback;
  return Math.min(v, SEAT_CAP);
}

/**
 * Holds the houses that are in use. A house is made when its first guest
 * arrives and dropped when its last guest leaves while nothing is running.
 *
 * opts.defaultSeats  seats for a house whose first guest names no count (12)
 * opts.pinnedSeats   { 'front-row--live': 12 } houses whose count a guest cannot change
 * opts.maxRooms      how many houses may exist at once (200), so a stream of
 *                    made-up slugs cannot grow the server without bound
 */
function createRegistry(opts = {}) {
  const defaultSeats = clampSeats(opts.defaultSeats, 12);
  const pinnedSeats = opts.pinnedSeats || {};
  const maxRooms = Number(opts.maxRooms) > 0 ? Number(opts.maxRooms) : 200;
  const rooms = new Map();

  function get(scope) {
    return rooms.get(scopeKey(scope)) || null;
  }

  /** The house for scope, made if needed. requestedSeats only counts when it is made. */
  function ensure(scope, requestedSeats) {
    const key = scopeKey(scope);
    let r = rooms.get(key);
    if (r) return r;
    if (rooms.size >= maxRooms) return null;
    const pinned = pinnedSeats[key];
    r = {
      key,
      venue: scope.venue,
      room: scope.room,
      channel: `house:${key}`,
      backstageChannel: `house:${key}:backstage`,
      livekitRoom: livekitRoomFor(scope.venue, scope.room),
      maxSeats: pinned ? clampSeats(pinned, defaultSeats) : clampSeats(requestedSeats, defaultSeats),
      show: newShowState(),
      profiles: {}, // { socketId: { name, imageUrl, selectedSeat, ... } }
      chat: [], // post-show chat, last 50 lines
      members: new Set(), // socket ids
      createdAt: Date.now(),
    };
    rooms.set(key, r);
    return r;
  }

  /** Clears a house's show and returns the fresh state (stops its countdown). */
  function resetShow(r) {
    const iv = r.show && r.show.countdown && r.show.countdown.interval;
    if (iv) clearInterval(iv);
    r.show = newShowState();
    return r.show;
  }

  function isQuiet(r) {
    const s = r.show;
    return r.members.size === 0 && s.status === 'idle' && !(s.countdown && s.countdown.isActive);
  }

  /** Drops a house that nobody is in and that has nothing running. */
  function maybeDrop(r) {
    if (!r || rooms.get(r.key) !== r || !isQuiet(r)) return false;
    resetShow(r);
    rooms.delete(r.key);
    return true;
  }

  function list() {
    return [...rooms.values()].map((r) => ({
      venue: r.venue,
      room: r.room,
      livekitRoom: r.livekitRoom,
      status: r.show.status,
      guests: r.members.size,
      seatsTaken: Object.keys(r.show.audienceSeats).length,
      maxSeats: r.maxSeats,
    }));
  }

  return { get, ensure, resetShow, maybeDrop, list, all: () => [...rooms.values()], size: () => rooms.size };
}

module.exports = {
  DEFAULT_SCOPE,
  ROOM_ALIASES,
  SEAT_CAP,
  isSlug,
  livekitRoomFor,
  scopeKey,
  parseScope,
  newShowState,
  createRegistry,
};
