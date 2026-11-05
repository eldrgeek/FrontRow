// What the builder tells its SOMA room about the edit ops, so an AI in
// the room can list them (list_app_ops) and propose one (propose_edit).
// The schema uses only the subset soma-rooms checks (APP-OPS contract §1).
// It is a guard for the room; ops.ts checkOp is what the page trusts.

import {
  ARRANGEMENTS, CURTAINS, KINDS, MAX_SCREENS, MAX_SEATS, MAX_SHELF, MAX_TICKET_USES, MAX_TICKETS, OpName, PALETTE_KEYS,
  TEMPLATES, TICKET_CHANNELS, TICKET_ROLES, TICKET_SCOPES,
} from './ops';

// approve: 'anyone' lets any person in the room claim a proposal as far as the
// room is concerned. Who may really change the theater is decided by the
// builder grant on the page and by the save RPC, not by who created the room.

export interface AppOpDecl {
  name: OpName;
  description: string;
  args: Record<string, unknown>;
  approve: 'host' | 'anyone';
}

const str = (maxLength: number) => ({ type: 'string', maxLength });
const lines = { type: 'array', items: str(60), maxItems: 3 };
const id = { type: 'string', minLength: 1, maxLength: 32 };

export const APP_OPS: AppOpDecl[] = [
  {
    name: 'setScreens',
    description:
      `Set the lobby's screens (doors), left to right, 1 to ${MAX_SCREENS}. List every screen to keep; a screen left out is removed. ` +
      'Existing ids keep any field you leave out. Exactly one screen must be kind "live" (the house with seats; only one for now); the rest are "shelf" screens of videos. ' +
      'Ids are lowercase letters, digits and dashes.',
    approve: 'anyone',
    args: {
      type: 'object',
      additionalProperties: false,
      required: ['screens'],
      properties: {
        screens: {
          type: 'array',
          maxItems: MAX_SCREENS,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id'],
            properties: {
              id,
              kind: { type: 'string', enum: KINDS },
              template: { type: 'string', enum: TEMPLATES },
              title: str(60),
              marquee: lines,
              blurb: str(280),
              signage: str(60),
            },
          },
        },
      },
    },
  },
  {
    name: 'setTheme',
    description: `Redecorate: colors as #rrggbb (${PALETTE_KEYS.join(', ')}; the first five set the look, the rest are derived when left out) and the curtain.`,
    approve: 'anyone',
    args: {
      type: 'object',
      additionalProperties: false,
      properties: {
        palette: {
          type: 'object',
          additionalProperties: false,
          properties: Object.fromEntries(PALETTE_KEYS.map((k) => [k, { type: 'string', minLength: 7, maxLength: 7 }])),
        },
        curtain: { type: 'string', enum: CURTAINS },
      },
    },
  },
  {
    name: 'setRoom',
    description:
      `Change one screen: its room template, its seats (live screen only, 1 to ${MAX_SEATS}) and seating arrangement, ` +
      'or the words on its door (title, marquee lines, blurb, signage).',
    approve: 'anyone',
    args: {
      type: 'object',
      additionalProperties: false,
      required: ['screen'],
      properties: {
        screen: id,
        template: { type: 'string', enum: TEMPLATES },
        seats: { type: 'integer', minimum: 1, maximum: MAX_SEATS },
        arrangement: { type: 'string', enum: ARRANGEMENTS },
        title: str(60),
        marquee: lines,
        blurb: str(280),
        signage: str(60),
      },
    },
  },
  {
    name: 'issueTickets',
    description:
      'Issue tickets: for the whole theater (venue), one screen, or one performance on a screen. A role (audience, performer, crew, manager), ' +
      `how they go out (sent, door, comp), a window (validFrom and validUntil, ISO times, both required), uses per ticket (devices it admits, default 1), ` +
      `an optional reserved seat (seat-N, one ticket only) and optional holder names or emails. At most ${MAX_TICKETS} at a time. Nothing is emailed without a person confirming.`,
    approve: 'anyone',
    args: {
      type: 'object',
      additionalProperties: false,
      required: ['scope', 'count', 'role', 'channel', 'validFrom', 'validUntil'],
      properties: {
        scope: { type: 'string', enum: TICKET_SCOPES },
        screen: id,
        performance: str(64),
        count: { type: 'integer', minimum: 1, maximum: MAX_TICKETS },
        role: { type: 'string', enum: TICKET_ROLES },
        channel: { type: 'string', enum: TICKET_CHANNELS },
        validFrom: str(40),
        validUntil: str(40),
        uses: { type: 'integer', minimum: 1, maximum: MAX_TICKET_USES },
        seat: { type: 'string', minLength: 6, maxLength: 7 },
        holders: { type: 'array', items: str(120), maxItems: MAX_TICKETS },
      },
    },
  },
  {
    name: 'addShelfItem',
    description:
      'Put a video on a shelf screen (not the live one): a title, an artist, and either a YouTube id or link (youtube) or an https video file (videoUrl). ' +
      `Optional note, the performance slug it records, and a position (at, from 0). At most ${MAX_SHELF} videos per shelf.`,
    approve: 'anyone',
    args: {
      type: 'object',
      additionalProperties: false,
      required: ['screen', 'title', 'artist'],
      properties: {
        screen: id,
        title: str(120),
        artist: str(120),
        youtube: str(200),
        videoUrl: str(490),
        note: str(120),
        performance: str(60),
        at: { type: 'integer', minimum: 0, maximum: MAX_SHELF },
      },
    },
  },
  {
    name: 'removeShelfItem',
    description: 'Take a video off a shelf screen, named by its YouTube id or link, its videoUrl, or its title.',
    approve: 'anyone',
    args: {
      type: 'object',
      additionalProperties: false,
      required: ['screen', 'item'],
      properties: { screen: id, item: str(500) },
    },
  },
];
