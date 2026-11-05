// A theater, as data.
//
// The theater kit stores each theater as one record: a parent `venues` row
// (the building) with one child `venues` row per screen (super_venue_id points
// at the parent). The whole definition below is what the parent's
// venue_settings.config holds, under `definition`. Front Row Theater is
// record 1 and is also compiled in here, so the guest evening renders the same
// whether or not the database answers.
//
// A theater says what the building is. A Show (show.ts) says what is on
// tonight in its live screen. Keep the two apart: a new night changes a Show,
// a redecoration changes the definition.

export const DEFINITION_SCHEMA = 1;

export type ScreenKind = 'live' | 'shelf';
export type ScreenTemplate = 'proscenium' | 'cabaret' | 'black-box' | 'roundtable' | 'custom';
export type SeatArrangement = 'semicircle' | 'rows' | 'tables' | 'round' | 'horseshoe';

export interface ShelfVideo {
  title: string;
  artist: string;
  youtubeId: string;
  note?: string;
}

export interface SeatLayout {
  count: number;
  /** Left out: the screen's template picks one (lib/seatLayout.ts arrangementFor). */
  arrangement?: SeatArrangement;
}

export interface ScreenDefinition {
  /** Stable within a theater; used in URLs (/shelf/:id) and as the child venue's key. */
  id: string;
  kind: ScreenKind;
  template: ScreenTemplate;
  /** Lobby position, left to right. */
  order: number;
  /** Words on the marquee above the door, one entry per line. `{artist}` is filled from tonight's show. */
  marquee: string[];
  /** Door title. `{artist}` is filled from tonight's show. */
  title: string;
  /** Door blurb. `{artist}`, `{when}`, `{setLength}`, `{seatsWord}` are filled from tonight's show. */
  blurb: string;
  /** Live screens only. */
  seats?: SeatLayout;
  /** Shelf screens only: what plays behind the door. */
  shelf?: ShelfVideo[];
  /** Optional sign beside the door (Noel: three screens with signage). */
  signage?: string;
}

/**
 * The house's colors. The first five are required; every other key is
 * optional and, when left out, is derived from those five (theater/theme.ts
 * resolvePalette), so a record saved with only five colors still loads.
 * theme.ts turns the result into CSS custom properties (--t-*) for the front
 * of house and into three.js material colors for the house.
 */
export interface ThemePalette {
  /** The lobby's back wall and the house's velvet. */
  wall: string;
  /** The box behind the marquee lettering. */
  marquee: string;
  /** Marquee lettering and bulbs. */
  marqueeText: string;
  /** Brass: door frames, trim, your own seat. */
  accent: string;
  /** A free seat. */
  seat: string;
  houseBlack?: string;
  wallHi?: string;
  carpet?: string;
  door?: string;
  accentLo?: string;
  accentHi?: string;
  marqueeGlow?: string;
  playbill?: string;
  playbillDim?: string;
  seatTaken?: string;
  stageWood?: string;
}

export interface ThemeTokens {
  palette: ThemePalette;
  curtain: 'velvet-red' | 'velvet-blue' | 'none';
}

export interface TheaterDefinition {
  schema: typeof DEFINITION_SCHEMA;
  /** URL key: /t/:slug, /build/:slug. */
  slug: string;
  name: string;
  /** Who the theater belongs to, in words (shown to guests). */
  hostedBy: string;
  theme: ThemeTokens;
  screens: ScreenDefinition[];
  /** Slug of the show playing in the live screen, if any (see show.ts). */
  currentShowSlug?: string;
}

/** Where a theater is in its life (migrations/005). Guests get in only when open or dark. */
export type TheaterStatus = 'draft' | 'preview' | 'open' | 'dark' | 'archived';
/** Where a screen (room) is in its life. */
export type RoomStatus = 'proposed' | 'setup' | 'open' | 'dark' | 'retired';

/** A stored record: the definition plus the database ids it lives under. */
export interface TheaterRecord {
  /** Parent venues.id. Null for the compiled-in copy. */
  venueId: string | null;
  /** Child venues.id per screen id. Empty for the compiled-in copy. */
  screenVenueIds: Record<string, string>;
  /** Increments on every save; a save names the version it started from. */
  version: number;
  definition: TheaterDefinition;
  source: 'database' | 'built-in';
  /** 'open' for a built-in record, and for a stored one read before migration 005. */
  status: TheaterStatus;
  /** Status per screen id; screens not listed count as open. */
  roomStatus: Record<string, RoomStatus>;
  /** The theater's one SOMA builder room, once a builder has made it. */
  builderRoomId: string | null;
}

// ---------------------------------------------------------------------------
// Record 1: Front Row Theater, exactly as PR #4's show.ts renders it.
// ---------------------------------------------------------------------------

export const FRONT_ROW_VENUE_ID = 'a0000000-0000-4000-8000-000000000001';

export const frontRowTheater: TheaterDefinition = {
  schema: DEFINITION_SCHEMA,
  slug: 'front-row',
  name: 'Front Row Theater',
  hostedBy: 'Noel Paul Stookey',
  theme: {
    // Exactly the colors theater.css, lobby.css and the 3D house used before
    // they read the theme, so Front Row looks the same.
    palette: {
      wall: '#2a0812',
      marquee: '#12050a',
      marqueeText: '#fff4d2',
      accent: '#d4af37',
      seat: '#9b1529',
      houseBlack: '#140508',
      wallHi: '#5a1626',
      carpet: '#6e0f1d',
      door: '#8d1426',
      accentLo: '#a9791f',
      accentHi: '#f6e3a1',
      marqueeGlow: '#ffd66b',
      playbill: '#f4ead3',
      playbillDim: '#c9b48a',
      seatTaken: '#4a0812',
      stageWood: '#6b4426',
    },
    curtain: 'velvet-red',
  },
  currentShowSlug: 'jess-wayne',
  screens: [
    {
      id: 'revolution',
      kind: 'shelf',
      template: 'black-box',
      order: 0,
      marquee: ['Songs of the', 'Revolution'],
      title: 'Songs of the Revolution',
      blurb: 'Three-to-five-minute music videos. Short, urgent songs, playing all the time.',
      shelf: [],
    },
    {
      id: 'live',
      kind: 'live',
      template: 'proscenium',
      order: 1,
      marquee: ['Live tonight', '{artist}'],
      title: '{artist}, live',
      blurb: '{when}. {setLength}. {seatsWord} seats, close to the stage.',
      seats: { count: 12, arrangement: 'semicircle' },
    },
    {
      id: 'library',
      kind: 'shelf',
      template: 'cabaret',
      order: 2,
      marquee: ['Performance', 'Library'],
      title: 'The Performance Library',
      blurb: 'Full concerts and past shows, ready whenever you want a front row seat.',
      shelf: [
        {
          title: 'Jess Wayne Trio, Part III',
          artist: 'Jess Wayne Trio',
          youtubeId: 'K6ZeroIZd5g',
          note: 'A full set, 25 minutes.',
        },
      ],
    },
  ],
};

export const BUILT_IN_THEATERS: Record<string, TheaterDefinition> = {
  [frontRowTheater.slug]: frontRowTheater,
};

export const DEFAULT_THEATER_SLUG = frontRowTheater.slug;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];

export function seatsWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

export interface ShowFill {
  artist: string;
  when: string;
  setLength: string;
}

/** Fill `{artist}`-style slots from tonight's show. Unknown slots are left as written. */
export function fill(text: string, show: ShowFill | null, screen?: ScreenDefinition): string {
  const values: Record<string, string> = {
    artist: show?.artist ?? '',
    when: show?.when ?? '',
    setLength: show?.setLength ?? '',
    seatsWord: screen?.seats ? seatsWord(screen.seats.count) : '',
  };
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m));
}

export function screensInOrder(def: TheaterDefinition): ScreenDefinition[] {
  return [...def.screens].sort((a, b) => a.order - b.order);
}

export function liveScreen(def: TheaterDefinition): ScreenDefinition | undefined {
  return screensInOrder(def).find((s) => s.kind === 'live');
}

export function getScreen(def: TheaterDefinition, id: string): ScreenDefinition | undefined {
  return def.screens.find((s) => s.id === id);
}

/** Problems that would stop a definition from rendering; empty when it is usable. */
export function validateDefinition(def: unknown): string[] {
  const errs: string[] = [];
  // Words joined by single dashes, at most 40 long: LiveKit rooms are frontrow-<theater>--<screen>.
  const isSlug = (v: unknown): boolean => typeof v === 'string' && v.length <= 40 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v);
  const d = def as Partial<TheaterDefinition> | null;
  if (!d || typeof d !== 'object') return ['definition is not an object'];
  if (d.schema !== DEFINITION_SCHEMA) errs.push(`schema must be ${DEFINITION_SCHEMA}`);
  if (!isSlug(d.slug)) errs.push('slug must be lowercase words joined by single dashes, at most 40 characters');
  if (!d.name) errs.push('name is required');
  if (!d.theme || !d.theme.palette) errs.push('theme.palette is required');
  if (!Array.isArray(d.screens) || d.screens.length === 0) {
    errs.push('at least one screen is required');
    return errs;
  }
  const ids = new Set<string>();
  d.screens.forEach((s, i) => {
    const at = `screens[${i}]`;
    if (!isSlug(s.id)) errs.push(`${at}.id must be lowercase words joined by single dashes, at most 40 characters`);
    if (ids.has(s.id)) errs.push(`${at}.id "${s.id}" is used twice`);
    ids.add(s.id);
    if (s.kind !== 'live' && s.kind !== 'shelf') errs.push(`${at}.kind must be live or shelf`);
    if (!Array.isArray(s.marquee)) errs.push(`${at}.marquee must be a list of lines`);
    if (s.kind === 'live' && !(s.seats && s.seats.count > 0)) errs.push(`${at} is live and needs seats.count`);
  });
  if (d.screens.filter((s) => s.kind === 'live').length > 1) errs.push('only one live screen is supported for now');
  return errs;
}
