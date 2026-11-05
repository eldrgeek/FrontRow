// The builder's edit ops: the only ways a theater definition changes.
//
// A person at the settings panel and an AI in the builder's SOMA room both
// produce the same ops. Every op is validated here, again, before it is
// applied, whoever sent it: the room's schema check is a guard, not the
// authority (soma-rooms APP-OPS contract §5). applyOp is pure, so the preview
// can show a proposal before anyone approves it.
//
// issueTickets is the odd one out: it does not change the definition. It is
// validated and previewed here, then handed to the ticket issuer (tickets.ts).

import {
  ScreenDefinition,
  ShelfVideo,
  shelfKey,
  VIDEO_URL_RE,
  YOUTUBE_ID_RE,
  ScreenKind,
  ScreenTemplate,
  SeatArrangement,
  TheaterDefinition,
  ThemePalette,
  ThemeTokens,
  validateDefinition,
} from '../theater/definition';
import { arrangementFor, MAX_LAYOUT_SEATS } from '../lib/seatLayout';

export const OP_NAMES = ['setScreens', 'setTheme', 'setRoom', 'issueTickets', 'addShelfItem', 'removeShelfItem'] as const;
export type OpName = (typeof OP_NAMES)[number];

// The allowed values come from definition.ts's types. A Record over each type
// fails to compile when the type gains or loses a member, so these lists
// cannot drift from the definition.
const keys = <K extends string>(r: Record<K, true>): K[] => Object.keys(r) as K[];
export const TEMPLATES = keys<ScreenTemplate>({ proscenium: true, cabaret: true, 'black-box': true, roundtable: true, custom: true });
export const ARRANGEMENTS = keys<SeatArrangement>({ semicircle: true, rows: true, tables: true, round: true, horseshoe: true });
export const KINDS = keys<ScreenKind>({ live: true, shelf: true });
export const CURTAINS = keys<ThemeTokens['curtain']>({ 'velvet-red': true, 'velvet-blue': true, none: true });
export type PaletteKey = keyof ThemePalette;
export const PALETTE_KEYS = keys<PaletteKey>({
  wall: true, marquee: true, marqueeText: true, accent: true, seat: true,
  houseBlack: true, wallHi: true, carpet: true, door: true, accentLo: true, accentHi: true,
  marqueeGlow: true, playbill: true, playbillDim: true, seatTaken: true, stageWood: true,
});
/** The five colors every theme has; the rest are derived when left out (theme.ts). */
export const BASE_PALETTE_KEYS: PaletteKey[] = ['wall', 'marquee', 'marqueeText', 'accent', 'seat'];

// Ticket fields as POST /api/ticket-issue takes them (server/tickets.mjs).
export const TICKET_ROLES = ['audience', 'performer', 'crew', 'manager'] as const;
export const TICKET_SCOPES = ['venue', 'screen', 'performance'] as const;
export const TICKET_CHANNELS = ['sent', 'door', 'comp'] as const;

/** Limits. Noel's caution: many doors confuse a guest, so the builder caps them. */
export const MAX_SCREENS = 10;
/** One cap for seats, shared with the house and the server's seat ids. */
export const MAX_SEATS = MAX_LAYOUT_SEATS;
/** The ticket API's MAX_BATCH. */
export const MAX_TICKETS = 200;
/** How many devices one ticket admits (the API's maxDevices). */
export const MAX_TICKET_USES = 1000;
/** Until each live screen gets its own room at runtime, the server and LiveKit run one (frontrow-main). */
export const ONE_LIVE_SCREEN = 'Only one live screen for now: the server and LiveKit still run a single live room (frontrow-main).';
export const MAX_SHELF = 60;
const MAX_LINE = 60;
const MAX_TEXT = 280;

export interface ScreenSpec {
  id: string;
  kind?: ScreenKind;
  template?: ScreenTemplate;
  title?: string;
  marquee?: string[];
  blurb?: string;
  signage?: string;
}

export interface SetScreensArgs {
  /** The full lobby, left to right. Ids already in the theater keep anything not named. */
  screens: ScreenSpec[];
}

export interface SetThemeArgs {
  palette?: Partial<Record<PaletteKey, string>>;
  curtain?: ThemeTokens['curtain'];
}

export interface SetRoomArgs {
  screen: string;
  template?: ScreenTemplate;
  seats?: number;
  arrangement?: SeatArrangement;
  title?: string;
  marquee?: string[];
  blurb?: string;
  signage?: string;
}

export interface IssueTicketsArgs {
  scope: (typeof TICKET_SCOPES)[number];
  /** Screen id, for scope 'screen' or 'performance'. */
  screen?: string;
  /** Show slug, for scope 'performance'. */
  performance?: string;
  count: number;
  role: (typeof TICKET_ROLES)[number];
  channel: (typeof TICKET_CHANNELS)[number];
  /** ISO times, both required. A ticket outside its window lets you into the lobby only. */
  validFrom: string;
  validUntil: string;
  /** How many devices may use each ticket (1 = one person; more = an open door pass). */
  uses?: number;
  /** A reserved seat (seat-N), for a single ticket. */
  seat?: string;
  /** Names or emails, one ticket each. Sending mail always asks a person first. */
  holders?: string[];
}

export interface AddShelfItemArgs {
  /** A shelf screen's id. */
  screen: string;
  title: string;
  artist: string;
  /** A YouTube id or link; or videoUrl. */
  youtube?: string;
  videoUrl?: string;
  note?: string;
  /** The performance this is a recording of (migrations/006), if any. */
  performance?: string;
  /** Where on the shelf, from 0; left out = the end. */
  at?: number;
}

export interface RemoveShelfItemArgs {
  screen: string;
  /** Which item: its YouTube id, its videoUrl, or its title. */
  item: string;
}

export type EditOp =
  | { op: 'setScreens'; args: SetScreensArgs }
  | { op: 'setTheme'; args: SetThemeArgs }
  | { op: 'setRoom'; args: SetRoomArgs }
  | { op: 'issueTickets'; args: IssueTicketsArgs }
  | { op: 'addShelfItem'; args: AddShelfItemArgs }
  | { op: 'removeShelfItem'; args: RemoveShelfItemArgs };

export type Checked =
  | { ok: true; op: EditOp }
  | { ok: false; errors: string[] };

export interface Applied {
  next: TheaterDefinition;
  /** One line per thing that changed, for the preview and the changelog. */
  changes: string[];
  /** Set for issueTickets: the request to hand to the ticket issuer. */
  tickets?: IssueTicketsArgs;
}

// ---------------------------------------------------------------------------
// Checking untrusted input
// ---------------------------------------------------------------------------

const ID_RE = /^[a-z0-9-]{1,32}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

function text(v: unknown, max: number, at: string, errs: string[]): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') { errs.push(`${at} must be text`); return undefined; }
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\t\n\r]/g, ' ').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > max) { errs.push(`${at} is longer than ${max} characters`); return undefined; }
  return s;
}

function lines(v: unknown, at: string, errs: string[]): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length === 0 || v.length > 3) { errs.push(`${at} must be 1 to 3 lines`); return undefined; }
  const out = v.map((l, i) => text(l, MAX_LINE, `${at}[${i}]`, errs) ?? '');
  return out;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], at: string, errs: string[]): T | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    errs.push(`${at} must be one of ${allowed.join(', ')}`);
    return undefined;
  }
  return v as T;
}

function int(v: unknown, min: number, max: number, at: string, errs: string[]): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    errs.push(`${at} must be a whole number from ${min} to ${max}`);
    return undefined;
  }
  return v;
}

function noExtra(o: Obj, allowed: string[], at: string, errs: string[]) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) errs.push(`${at} has an unknown field "${k}"`);
}

function time(v: unknown, at: string, errs: string[]): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) { errs.push(`${at} must be a date and time`); return undefined; }
  return new Date(v).toISOString();
}

/** A YouTube id from an id or a youtu.be / youtube.com link; null if it is neither. */
export function youtubeIdFrom(s: string): string | null {
  const t = s.trim();
  if (YOUTUBE_ID_RE.test(t)) return t;
  const m = /^https:\/\/(?:www\.|m\.)?(?:youtu\.be\/|youtube\.com\/watch\?(?:[^#]*&)?v=|youtube\.com\/live\/)([A-Za-z0-9_-]{6,20})/.exec(t);
  return m ? m[1] : null;
}

/** Turn untrusted {op, args} (from an AI, a panel, or the network) into a typed op, or say what is wrong. */
export function checkOp(op: unknown, args: unknown): Checked {
  const errs: string[] = [];
  if (typeof op !== 'string' || !(OP_NAMES as readonly string[]).includes(op)) {
    return { ok: false, errors: [`unknown op "${String(op)}"`] };
  }
  if (!isObj(args)) return { ok: false, errors: ['args must be an object'] };

  switch (op as OpName) {
    case 'setScreens': {
      noExtra(args, ['screens'], 'args', errs);
      const list = args.screens;
      if (!Array.isArray(list) || list.length === 0 || list.length > MAX_SCREENS) {
        errs.push(`screens must list 1 to ${MAX_SCREENS} screens`);
        break;
      }
      const seen = new Set<string>();
      const screens: ScreenSpec[] = list.map((raw, i) => {
        const at = `screens[${i}]`;
        if (!isObj(raw)) { errs.push(`${at} must be an object`); return { id: '' }; }
        noExtra(raw, ['id', 'kind', 'template', 'title', 'marquee', 'blurb', 'signage'], at, errs);
        const id = typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : '';
        if (!id) errs.push(`${at}.id must be 1 to 32 lowercase letters, digits or dashes`);
        else if (seen.has(id)) errs.push(`${at}.id "${id}" is used twice`);
        seen.add(id);
        return {
          id,
          kind: oneOf(raw.kind, KINDS, `${at}.kind`, errs),
          template: oneOf(raw.template, TEMPLATES, `${at}.template`, errs),
          title: text(raw.title, MAX_LINE, `${at}.title`, errs),
          marquee: lines(raw.marquee, `${at}.marquee`, errs),
          blurb: text(raw.blurb, MAX_TEXT, `${at}.blurb`, errs),
          signage: text(raw.signage, MAX_LINE, `${at}.signage`, errs),
        };
      });
      if (!errs.length) return { ok: true, op: { op: 'setScreens', args: { screens } } };
      break;
    }
    case 'setTheme': {
      noExtra(args, ['palette', 'curtain'], 'args', errs);
      const out: SetThemeArgs = {};
      if (args.palette !== undefined) {
        if (!isObj(args.palette)) errs.push('palette must be an object');
        else {
          noExtra(args.palette, [...PALETTE_KEYS], 'palette', errs);
          const p: Partial<Record<PaletteKey, string>> = {};
          for (const k of PALETTE_KEYS) {
            const v = args.palette[k];
            if (v === undefined) continue;
            if (typeof v !== 'string' || !COLOR_RE.test(v)) errs.push(`palette.${k} must be a color like #c8102e`);
            else p[k] = v.toLowerCase();
          }
          out.palette = p;
        }
      }
      out.curtain = oneOf(args.curtain, CURTAINS, 'curtain', errs);
      if (out.curtain === undefined) delete out.curtain;
      if (!out.palette && !out.curtain && !errs.length) errs.push('setTheme needs a palette or a curtain');
      if (!errs.length) return { ok: true, op: { op: 'setTheme', args: out } };
      break;
    }
    case 'setRoom': {
      noExtra(args, ['screen', 'template', 'seats', 'arrangement', 'title', 'marquee', 'blurb', 'signage'], 'args', errs);
      const screen = typeof args.screen === 'string' && ID_RE.test(args.screen) ? args.screen : '';
      if (!screen) errs.push('screen must name a screen id');
      const out: SetRoomArgs = {
        screen,
        template: oneOf(args.template, TEMPLATES, 'template', errs),
        seats: int(args.seats, 1, MAX_SEATS, 'seats', errs),
        arrangement: oneOf(args.arrangement, ARRANGEMENTS, 'arrangement', errs),
        title: text(args.title, MAX_LINE, 'title', errs),
        marquee: lines(args.marquee, 'marquee', errs),
        blurb: text(args.blurb, MAX_TEXT, 'blurb', errs),
        signage: text(args.signage, MAX_LINE, 'signage', errs),
      };
      for (const k of Object.keys(out) as (keyof SetRoomArgs)[]) if (out[k] === undefined) delete out[k];
      if (Object.keys(out).length === 1 && !errs.length) errs.push('setRoom needs something to change');
      if (!errs.length) return { ok: true, op: { op: 'setRoom', args: out } };
      break;
    }
    case 'issueTickets': {
      noExtra(args, ['scope', 'screen', 'performance', 'count', 'role', 'channel', 'validFrom', 'validUntil', 'uses', 'seat', 'holders'], 'args', errs);
      const scope = oneOf(args.scope, TICKET_SCOPES, 'scope', errs);
      const role = oneOf(args.role, TICKET_ROLES, 'role', errs);
      const channel = oneOf(args.channel, TICKET_CHANNELS, 'channel', errs);
      const count = int(args.count, 1, MAX_TICKETS, 'count', errs);
      if (!scope) errs.push('scope is required');
      if (!role) errs.push('role is required');
      if (!channel) errs.push('channel is required');
      if (count === undefined && args.count === undefined) errs.push('count is required');
      let screen: string | undefined;
      if (args.screen !== undefined) {
        if (typeof args.screen === 'string' && ID_RE.test(args.screen)) screen = args.screen;
        else errs.push('screen must name a screen id');
      }
      if ((scope === 'screen' || scope === 'performance') && !screen) errs.push(`scope ${scope} needs a screen`);
      const performance = text(args.performance, 64, 'performance', errs);
      if (scope === 'performance' && !performance) errs.push('scope performance needs a performance');
      const validFrom = time(args.validFrom, 'validFrom', errs);
      const validUntil = time(args.validUntil, 'validUntil', errs);
      if (args.validFrom === undefined) errs.push('validFrom is required');
      if (args.validUntil === undefined) errs.push('validUntil is required');
      if (validFrom && validUntil && validFrom >= validUntil) errs.push('validUntil must be after validFrom');
      const uses = int(args.uses, 1, MAX_TICKET_USES, 'uses', errs);
      let seat: string | undefined;
      if (args.seat !== undefined) {
        if (typeof args.seat === 'string' && /^seat-\d{1,2}$/.test(args.seat)) seat = args.seat;
        else errs.push('seat must look like seat-3');
        if (count !== undefined && count > 1) errs.push('a reserved seat goes on one ticket');
      }
      let holders: string[] | undefined;
      if (args.holders !== undefined) {
        if (!Array.isArray(args.holders) || args.holders.length > MAX_TICKETS) errs.push(`holders must be a list of at most ${MAX_TICKETS}`);
        else holders = args.holders.map((h, i) => text(h, 120, `holders[${i}]`, errs) ?? '');
        if (holders && count !== undefined && holders.length !== count) errs.push('holders must name one person per ticket (as many as count)');
      }
      if (!errs.length) {
        const out: IssueTicketsArgs = { scope: scope!, count: count!, role: role!, channel: channel!, validFrom: validFrom!, validUntil: validUntil! };
        if (screen) out.screen = screen;
        if (performance) out.performance = performance;
        if (uses !== undefined) out.uses = uses;
        if (seat) out.seat = seat;
        if (holders) out.holders = holders;
        return { ok: true, op: { op: 'issueTickets', args: out } };
      }
      break;
    }
    case 'addShelfItem': {
      noExtra(args, ['screen', 'title', 'artist', 'youtube', 'videoUrl', 'note', 'performance', 'at'], 'args', errs);
      const screen = typeof args.screen === 'string' && ID_RE.test(args.screen) ? args.screen : '';
      if (!screen) errs.push('screen must name a shelf screen id');
      const title = text(args.title, 120, 'title', errs);
      const artist = text(args.artist, 120, 'artist', errs);
      if (!title) errs.push('title is required');
      if (!artist) errs.push('artist is required');
      let youtubeId: string | undefined;
      if (args.youtube !== undefined) {
        youtubeId = typeof args.youtube === 'string' ? youtubeIdFrom(args.youtube) ?? undefined : undefined;
        if (!youtubeId) errs.push('youtube must be a YouTube id or link');
      }
      let videoUrl: string | undefined;
      if (args.videoUrl !== undefined) {
        if (typeof args.videoUrl === 'string' && VIDEO_URL_RE.test(args.videoUrl)) videoUrl = args.videoUrl;
        else errs.push('videoUrl must be an https link');
      }
      if (args.youtube === undefined && args.videoUrl === undefined) errs.push('give a youtube id or link, or a videoUrl');
      if (youtubeId && videoUrl) errs.push('give a youtube id or a videoUrl, not both');
      const note = text(args.note, 120, 'note', errs);
      let performance: string | undefined;
      if (args.performance !== undefined) {
        if (typeof args.performance === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(args.performance) && args.performance.length <= 60) performance = args.performance;
        else errs.push('performance must be a performance slug');
      }
      const at = int(args.at, 0, MAX_SHELF, 'at', errs);
      if (!errs.length) {
        const out: AddShelfItemArgs = { screen, title: title!, artist: artist! };
        if (youtubeId) out.youtube = youtubeId;
        if (videoUrl) out.videoUrl = videoUrl;
        if (note) out.note = note;
        if (performance) out.performance = performance;
        if (at !== undefined) out.at = at;
        return { ok: true, op: { op: 'addShelfItem', args: out } };
      }
      break;
    }
    case 'removeShelfItem': {
      noExtra(args, ['screen', 'item'], 'args', errs);
      const screen = typeof args.screen === 'string' && ID_RE.test(args.screen) ? args.screen : '';
      if (!screen) errs.push('screen must name a shelf screen id');
      const item = typeof args.item === 'string' ? args.item.trim().slice(0, 500) : '';
      if (!item) errs.push('item must name a shelf item (its YouTube id, link or title)');
      if (!errs.length) return { ok: true, op: { op: 'removeShelfItem', args: { screen, item } } };
      break;
    }
  }
  return { ok: false, errors: errs };
}

// ---------------------------------------------------------------------------
// Applying (pure)
// ---------------------------------------------------------------------------

function newScreen(spec: ScreenSpec, order: number): ScreenDefinition {
  const kind = spec.kind ?? 'shelf';
  const title = spec.title ?? spec.id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    id: spec.id,
    kind,
    template: spec.template ?? (kind === 'live' ? 'proscenium' : 'black-box'),
    order,
    marquee: spec.marquee ?? [title],
    title,
    blurb: spec.blurb ?? '',
    ...(kind === 'live' ? { seats: { count: 12 } } : { shelf: [] }),
    ...(spec.signage ? { signage: spec.signage } : {}),
  };
}

function screenLabel(s: ScreenDefinition): string {
  // Titles may hold show slots like {artist}; the id reads better in a log.
  return s.title.includes('{') ? `the ${s.id} screen` : `"${s.title}"`;
}

/** Apply a checked op to a definition. Returns the new definition, or the reasons it can't apply. */
export function applyOp(def: TheaterDefinition, edit: EditOp): Applied | { errors: string[] } {
  const next: TheaterDefinition = structuredClone(def);
  const changes: string[] = [];

  switch (edit.op) {
    case 'setScreens': {
      const before = new Map(def.screens.map((s) => [s.id, s]));
      const screens = edit.args.screens.map((spec, order) => {
        const old = before.get(spec.id);
        if (!old) {
          const s = newScreen(spec, order);
          changes.push(`Add screen ${screenLabel(s)} (${s.kind}, ${s.template})`);
          return s;
        }
        const s: ScreenDefinition = structuredClone(old);
        s.order = order;
        if (spec.kind && spec.kind !== s.kind) {
          s.kind = spec.kind;
          if (s.kind === 'live' && !s.seats) s.seats = { count: 12 };
          if (s.kind === 'shelf' && !s.shelf) s.shelf = [];
          changes.push(`${screenLabel(s)} becomes a ${s.kind} screen`);
        }
        if (spec.template && spec.template !== s.template) { s.template = spec.template; changes.push(`${screenLabel(s)} template: ${s.template}`); }
        if (spec.title && spec.title !== s.title) { changes.push(`Rename ${screenLabel(s)} to "${spec.title}"`); s.title = spec.title; }
        if (spec.marquee) { s.marquee = spec.marquee; changes.push(`${screenLabel(s)} marquee: ${spec.marquee.join(' / ')}`); }
        if (spec.blurb !== undefined && spec.blurb !== s.blurb) { s.blurb = spec.blurb; changes.push(`${screenLabel(s)} blurb changed`); }
        if (spec.signage !== undefined && spec.signage !== s.signage) { s.signage = spec.signage || undefined; changes.push(`${screenLabel(s)} sign: ${spec.signage || '(none)'}`); }
        if (old.order !== order) changes.push(`Move ${screenLabel(s)} to door ${order + 1}`);
        return s;
      });
      if (screens.filter((s) => s.kind === 'live').length > 1) return { errors: [ONE_LIVE_SCREEN] };
      const kept = new Set(screens.map((s) => s.id));
      for (const s of def.screens) if (!kept.has(s.id)) changes.push(`Remove screen ${screenLabel(s)}`);
      next.screens = screens;
      break;
    }
    case 'setTheme': {
      const { palette, curtain } = edit.args;
      if (palette) {
        for (const k of PALETTE_KEYS) {
          const v = palette[k];
          if (v && v !== next.theme.palette[k]) { next.theme.palette[k] = v; changes.push(`Color ${k}: ${v}`); }
        }
      }
      if (curtain && curtain !== next.theme.curtain) { next.theme.curtain = curtain; changes.push(`Curtain: ${curtain}`); }
      break;
    }
    case 'setRoom': {
      const s = next.screens.find((x) => x.id === edit.args.screen);
      if (!s) return { errors: [`there is no screen "${edit.args.screen}"`] };
      const a = edit.args;
      if (a.template && a.template !== s.template) { s.template = a.template; changes.push(`${screenLabel(s)} template: ${a.template}`); }
      if (a.seats !== undefined || a.arrangement) {
        if (s.kind !== 'live') return { errors: [`${screenLabel(s)} is a shelf; only the live screen has seats`] };
        const seats = s.seats ?? { count: 12 };
        if (a.seats !== undefined && a.seats !== seats.count) { changes.push(`${screenLabel(s)} seats: ${seats.count} → ${a.seats}`); seats.count = a.seats; }
        // A layout with no arrangement takes its template's; compare what guests actually see.
        if (a.arrangement && a.arrangement !== arrangementFor(seats, s.template)) {
          changes.push(`${screenLabel(s)} seating: ${a.arrangement}`);
          seats.arrangement = a.arrangement;
        }
        s.seats = seats;
      }
      if (a.title && a.title !== s.title) { changes.push(`Rename ${screenLabel(s)} to "${a.title}"`); s.title = a.title; }
      if (a.marquee) { s.marquee = a.marquee; changes.push(`${screenLabel(s)} marquee: ${a.marquee.join(' / ')}`); }
      if (a.blurb !== undefined && a.blurb !== s.blurb) { s.blurb = a.blurb; changes.push(`${screenLabel(s)} blurb changed`); }
      if (a.signage !== undefined && a.signage !== s.signage) { s.signage = a.signage || undefined; changes.push(`${screenLabel(s)} sign: ${a.signage || '(none)'}`); }
      break;
    }
    case 'issueTickets': {
      const a = edit.args;
      if (a.screen && !def.screens.some((s) => s.id === a.screen)) return { errors: [`there is no screen "${a.screen}"`] };
      const where = a.scope === 'venue' ? 'the whole theater' : a.scope === 'screen' ? `screen "${a.screen}"` : `${a.performance} in "${a.screen}"`;
      const when = `, good ${a.validFrom} to ${a.validUntil}`;
      const who = a.holders?.length ? `, ${a.holders.length} named` : '';
      const uses = a.uses && a.uses > 1 ? `, ${a.uses} uses each` : '';
      const seat = a.seat ? `, seat ${a.seat}` : '';
      changes.push(`Issue ${a.count} ${a.role} ticket${a.count === 1 ? '' : 's'} for ${where} (${a.channel}${who}${uses}${seat}${when})`);
      return { next: def, changes, tickets: a };
    }
    case 'addShelfItem': {
      const a = edit.args;
      const s = next.screens.find((x) => x.id === a.screen);
      if (!s) return { errors: [`there is no screen "${a.screen}"`] };
      if (s.kind !== 'shelf') return { errors: [`${screenLabel(s)} is the live screen; only shelves hold videos`] };
      const shelf = s.shelf ?? [];
      if (shelf.length >= MAX_SHELF) return { errors: [`${screenLabel(s)} already holds ${MAX_SHELF} videos`] };
      const item: ShelfVideo = { title: a.title, artist: a.artist };
      if (a.youtube) item.youtubeId = a.youtube;
      if (a.videoUrl) item.videoUrl = a.videoUrl;
      if (a.note) item.note = a.note;
      if (a.performance) item.performanceSlug = a.performance;
      if (shelf.some((v) => shelfKey(v) === shelfKey(item))) return { errors: [`"${a.title}" is already on ${screenLabel(s)}`] };
      const at = a.at === undefined ? shelf.length : Math.min(a.at, shelf.length);
      s.shelf = [...shelf.slice(0, at), item, ...shelf.slice(at)];
      changes.push(`Shelve "${a.title}" (${a.artist}) on ${screenLabel(s)}${at < shelf.length ? `, at ${at + 1}` : ''}`);
      break;
    }
    case 'removeShelfItem': {
      const a = edit.args;
      const s = next.screens.find((x) => x.id === a.screen);
      if (!s) return { errors: [`there is no screen "${a.screen}"`] };
      const shelf = s.shelf ?? [];
      const yt = youtubeIdFrom(a.item);
      const i = shelf.findIndex((v) => (yt && v.youtubeId === yt) || v.videoUrl === a.item || v.title === a.item);
      if (i < 0) return { errors: [`${screenLabel(s)} has no "${a.item}"`] };
      changes.push(`Take "${shelf[i].title}" off ${screenLabel(s)}`);
      s.shelf = shelf.filter((_, j) => j !== i);
      break;
    }
  }

  const errs = validateDefinition(next);
  if (errs.length) return { errors: errs };
  if (!changes.length) changes.push('No change');
  return { next, changes };
}

/** One line a person reads on a proposal card. */
export function describeOp(def: TheaterDefinition, edit: EditOp): string {
  const r = applyOp(def, edit);
  if ('errors' in r) return `${edit.op} (cannot apply: ${r.errors[0]})`;
  return r.changes.join('; ');
}
