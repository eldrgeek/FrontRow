// Front Row Theater: the shows the front of house knows about.
//
// One show is "tonight's". The invite, ticket, lobby and house all read from
// here, so a new night is a new entry in SHOWS, not a code change elsewhere.
// These compiled-in shows are the floor: schedule.ts reads the performances
// table (migrations/006) and a stored row replaces the entry of the same slug.

import { fill, frontRowTheater, screensInOrder, ShelfVideo } from './definition';

export type { ShelfVideo };

export type DoorId = 'revolution' | 'live' | 'library';

export interface Door {
  id: DoorId;
  /** Words on the marquee above the door, one entry per line. */
  marquee: string[];
  title: string;
  blurb: string;
  side: 'left' | 'center' | 'right';
}

export interface Show {
  slug: string;
  artist: string;
  /** Painted on the stage boards. */
  stageName: string;
  tagline: string;
  when: string;
  doorsOpen: string;
  setLength: string;
  invitedBy: string;
  seats: number;
  /** Plays on the stage screen until the performer's own stream arrives. */
  fallbackVideoUrl: string;
  /** Set when the show comes from the performances table (schedule.ts, migrations/006). */
  status?: PerformanceStatus;
  startsAt?: string;
  doorsAt?: string;
  /** The screen it plays on. */
  screen?: string;
}

/** A performance's place in its night (migrations/006). Forward only; 'cancelled' before 'after'. */
export type PerformanceStatus =
  | 'scheduled' | 'tickets-out' | 'doors' | 'green-room' | 'curtain' | 'after' | 'library' | 'cancelled';

export const SHOWS: Record<string, Show> = {
  'jess-wayne': {
    slug: 'jess-wayne',
    artist: 'Jess Wayne',
    stageName: 'JESS WAYNE',
    tagline: 'live at Front Row Theater',
    when: 'Friday · 8:00 pm',
    doorsOpen: '7:45 pm',
    setLength: 'Twenty-minute set and an encore',
    invitedBy: 'Noel, Harold, George and the Hootnet gang',
    seats: 12,
    fallbackVideoUrl: 'https://youtu.be/K6ZeroIZd5g',
  },
};

export const CURRENT_SHOW_SLUG = 'jess-wayne';

export function getShow(slug?: string): Show | null {
  return SHOWS[slug || CURRENT_SHOW_SLUG] || null;
}

/**
 * Front Row's three doors, now read from its theater definition
 * (definition.ts, record 1). Kept for callers that predate the record.
 */
export function doorsFor(show: Show): Door[] {
  const sides: Door['side'][] = ['left', 'center', 'right'];
  return screensInOrder(frontRowTheater).map((screen, i) => ({
    id: screen.id as DoorId,
    side: sides[i],
    marquee: screen.marquee.map((line) => fill(line, show, screen)),
    title: fill(screen.title, show, screen),
    blurb: fill(screen.blurb, show, screen),
  }));
}

/** What plays behind the side doors; also from the definition. */
export const SHELVES: Record<Exclude<DoorId, 'live'>, ShelfVideo[]> = {
  revolution: frontRowTheater.screens.find((s) => s.id === 'revolution')?.shelf ?? [],
  library: frontRowTheater.screens.find((s) => s.id === 'library')?.shelf ?? [],
};
