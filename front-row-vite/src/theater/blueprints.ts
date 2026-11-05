// Sample theaters for trying the kit's layouts and templates.
//
// Dev servers and deploy previews only (import.meta.env.DEV): open any page of
// the guest evening with ?theater=<slug>, e.g. /show/jess-wayne/lobby?theater=ten-screens,
// and the choice sticks for the tab. ?theater=front-row goes back. Production
// always shows Front Row until theater records load from the database.
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_THEATER_SLUG, DEFINITION_SCHEMA, TheaterStatus, ScreenDefinition, TheaterDefinition, frontRowTheater } from './definition';
import { isBuilder, useTheater } from './theaterStore';

const live = (over: Partial<ScreenDefinition> = {}): ScreenDefinition => ({
  ...frontRowTheater.screens.find((s) => s.kind === 'live')!,
  ...over,
});

const shelf = (id: string, order: number, marquee: string[], blurb: string, signage?: string): ScreenDefinition => ({
  id,
  kind: 'shelf',
  template: 'black-box',
  order,
  marquee,
  title: marquee.join(' '),
  blurb,
  shelf: [],
  signage,
});

const fiveScreens: TheaterDefinition = {
  ...frontRowTheater,
  slug: 'five-screens',
  name: 'Five-screen sample',
  screens: [
    shelf('revolution', 0, ['Songs of the', 'Revolution'], 'Short, urgent songs, playing all the time.'),
    shelf('open-mic', 1, ['Open', 'Mic'], 'Anyone with a song, five minutes each.'),
    live({ order: 2 }),
    shelf('workshop', 3, ['Songwriting', 'Workshop'], 'Writers trading verses, Sunday afternoons.'),
    shelf('library', 4, ['Performance', 'Library'], 'Full concerts and past shows.'),
  ],
};

const tenScreens: TheaterDefinition = {
  ...frontRowTheater,
  slug: 'ten-screens',
  name: 'Ten-screen sample',
  theme: {
    palette: { wall: '#0f1a2e', marquee: '#060b16', marqueeText: '#e8f1ff', accent: '#c0c8d8', seat: '#2b4a8a' },
    curtain: 'velvet-blue',
  },
  screens: [
    shelf('revolution', 0, ['Songs of the', 'Revolution'], 'Short, urgent songs.'),
    shelf('open-mic', 1, ['Open', 'Mic'], 'Anyone with a song.'),
    live({ order: 2, template: 'cabaret', seats: { count: 16 } }),
    shelf('workshop', 3, ['Songwriting', 'Workshop'], 'Writers trading verses.'),
    shelf('library', 4, ['Performance', 'Library'], 'Full concerts and past shows.'),
    shelf('kids', 5, ['Family', 'Matinee'], 'Songs for small people.', 'Saturdays at 11'),
    shelf('archive', 6, ['Hootnet', 'Archive'], 'The gang, over the years.', 'Every Hootnet since 2020'),
    shelf('lessons', 7, ['Guitar', 'Lessons'], 'Fingerpicking for beginners.', 'New lesson every week'),
    shelf('poetry', 8, ['Spoken', 'Word'], 'Poets and storytellers.', 'Tonight: open floor'),
    shelf('jams', 9, ['Late Night', 'Jams'], 'After hours, anyone can sit in.', 'From 10 pm'),
  ],
};

const blackBox: TheaterDefinition = {
  ...frontRowTheater,
  slug: 'black-box',
  name: 'Black box sample',
  theme: {
    palette: { wall: '#151515', marquee: '#050505', marqueeText: '#f2f2f2', accent: '#b8b8b8', seat: '#3a3a3a', stageWood: '#1e1e1e' },
    curtain: 'none',
  },
  screens: [live({ order: 0, template: 'black-box', seats: { count: 12 } })],
};

const roundTable: TheaterDefinition = {
  ...frontRowTheater,
  slug: 'round-table',
  name: 'Round table sample',
  theme: {
    palette: { wall: '#2b1d0e', marquee: '#140c05', marqueeText: '#fff1d6', accent: '#d9a441', seat: '#7a4a1f' },
    curtain: 'none',
  },
  screens: [
    live({ order: 0, template: 'roundtable', seats: { count: 10 } }),
    shelf('library', 1, ['Past', 'Circles'], 'Recordings of earlier circles.'),
  ],
};

const rows: TheaterDefinition = {
  ...frontRowTheater,
  slug: 'proscenium-rows',
  name: 'Proscenium sample',
  screens: [...frontRowTheater.screens.map((s) => (s.kind === 'live' ? live({ seats: { count: 16, arrangement: 'rows' } }) : s))],
};

export const BLUEPRINTS: Record<string, TheaterDefinition> = Object.fromEntries(
  [fiveScreens, tenScreens, blackBox, roundTable, rows].map((d) => [d.slug, { ...d, schema: DEFINITION_SCHEMA }]),
);

const KEY = 'frontrow_kit_theater';

/**
 * The sample this tab asked for, or null. Dev and preview builds only: the
 * URL's ?theater=<slug> (remembered for the tab) picks one of BLUEPRINTS.
 */
export function sampleTheater(search: string = typeof window !== 'undefined' ? window.location.search : ''): TheaterDefinition | null {
  if (!import.meta.env.DEV) return null;
  let slug: string | null = null;
  try {
    slug = new URLSearchParams(search).get('theater');
    if (slug) sessionStorage.setItem(KEY, slug);
    else slug = sessionStorage.getItem(KEY);
  } catch {
    /* storage blocked: the URL alone decides */
  }
  return (slug && BLUEPRINTS[slug]) || null;
}

/**
 * The theater this tab shows: a sample if one was asked for, else Front Row's
 * stored record (theaterStore.ts), which starts as, and falls back to, the
 * built-in copy. A stored theater the guest may not open (canOpenTheater)
 * shows the built-in Front Row instead.
 */
export function useCurrentTheater(): TheaterDefinition {
  const sample = useMemo(() => sampleTheater(), []);
  const slug = DEFAULT_THEATER_SLUG;
  const { record } = useTheater(slug);
  const needsBuilder = !!record && !canOpenTheater(record.status, false) && record.status !== 'archived';
  const [builder, setBuilder] = useState(false);
  useEffect(() => {
    if (!needsBuilder) return;
    let live = true;
    isBuilder(slug).then((b) => live && setBuilder(b));
    return () => {
      live = false;
    };
  }, [needsBuilder, slug]);
  if (sample) return sample;
  return record && canOpenTheater(record.status, builder) ? record.definition : frontRowTheater;
}

/**
 * Who may open a stored theater by URL, by its status (migration 005):
 * open and dark (the "no performance tonight" lobby) for everyone, draft and
 * preview for builders only, archived for nobody. No status counts as open;
 * an unknown status opens only for builders.
 */
export function canOpenTheater(status: TheaterStatus | string | null | undefined, builder: boolean): boolean {
  const s = status ?? 'open';
  if (s === 'archived') return false;
  if (s === 'open' || s === 'dark') return true;
  return builder;
}
