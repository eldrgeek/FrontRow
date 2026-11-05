// Which house a page is in: a theater (venue) and one of its screens (room).
//
// Each screen is its own house on frontrow-server (server/rooms.js): its own
// seats, show state and post-show chat. The same pair names the LiveKit room
// and scopes ticket grants (server/tickets.mjs livekitRoomFor), so the three
// cannot disagree about where a guest is.

export interface RoomScope {
  /** The theater's slug, e.g. 'front-row'. */
  venue: string;
  /** The screen's slug, e.g. 'live'. */
  room: string;
}

/** Front Row's live screen: what every page meant before the kit. */
export const DEFAULT_SCOPE: RoomScope = Object.freeze({ venue: 'front-row', room: 'live' });

/** The most seats one house may hold (frontrow-server enforces it too). */
export const HOUSE_SEAT_CAP = 99;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const isSlug = (s: unknown, max = 40): s is string =>
  typeof s === 'string' && s.length <= max && SLUG.test(s);

// LiveKit names that predate the kit (tickets.mjs ROOM_ALIASES).
const ROOM_ALIASES: Record<string, RoomScope> = {
  'frontrow-main': { venue: 'front-row', room: 'live' },
};

/** The LiveKit room for a house: frontrow-<venue>--<room>, or its older alias. */
export function livekitRoomFor(scope: RoomScope): string {
  for (const [name, a] of Object.entries(ROOM_ALIASES)) {
    if (a.venue === scope.venue && a.room === scope.room) return name;
  }
  return `frontrow-${scope.venue}--${scope.room}`;
}

/**
 * The house named by explicit values, else by ?theater=&screen= on the URL,
 * else Front Row's live screen. A malformed slug falls back rather than
 * sending the guest to a house nobody else can find.
 */
export function resolveScope(
  explicit?: Partial<RoomScope> | null,
  search: string = typeof window !== 'undefined' ? window.location.search : '',
): RoomScope {
  const q = new URLSearchParams(search);
  const venue = explicit?.venue ?? q.get('venue') ?? q.get('theater') ?? DEFAULT_SCOPE.venue;
  const room = explicit?.room ?? q.get('room') ?? q.get('screen') ?? DEFAULT_SCOPE.room;
  if (!isSlug(venue) || !isSlug(room)) return { ...DEFAULT_SCOPE };
  return { venue, room };
}

/** The Socket.io handshake query that puts a socket in this house. */
export function socketQueryFor(scope: RoomScope, seats?: number): Record<string, string> {
  const q: Record<string, string> = { venue: scope.venue, room: scope.room };
  if (seats && Number.isInteger(seats) && seats > 0) q.seats = String(Math.min(seats, HOUSE_SEAT_CAP));
  return q;
}
