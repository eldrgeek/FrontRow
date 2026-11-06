// What is on, from the performances table (migrations/006), with show.ts's
// compiled-in SHOWS as the floor.
//
// Like theaterStore, a guest never waits on or is broken by the database: a
// show compiled into SHOWS renders at once and is replaced by its stored row
// when one arrives. A show that exists only in the database shows "loading"
// for at most LOAD_TIMEOUT_MS. Writes (scheduling, status) go through
// save_performance, which checks the caller manages that screen.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DEFAULT_THEATER_SLUG } from './definition';
import { getShow, PerformanceStatus, Show } from './show';

const LOAD_TIMEOUT_MS = 2500;

export interface PerformanceRow {
  slug: string;
  title: string;
  artist: string;
  billing: Partial<Pick<Show, 'stageName' | 'tagline' | 'when' | 'doorsOpen' | 'setLength' | 'invitedBy' | 'fallbackVideoUrl'>>;
  status: PerformanceStatus;
  starts_at: string | null;
  doors_at: string | null;
  seats: number | null;
  screen?: { screen_key: string } | null;
}

/** A stored performance as the front of house's Show. Words the row lacks come from the compiled show of the same slug. */
export function rowToShow(row: PerformanceRow, base: Show | null = getShow(row.slug)): Show {
  const b = row.billing || {};
  const artist = row.artist || row.title;
  return {
    slug: row.slug,
    artist,
    stageName: b.stageName ?? base?.stageName ?? artist.toUpperCase(),
    tagline: b.tagline ?? base?.tagline ?? '',
    when: b.when ?? base?.when ?? '',
    doorsOpen: b.doorsOpen ?? base?.doorsOpen ?? '',
    setLength: b.setLength ?? base?.setLength ?? '',
    invitedBy: b.invitedBy ?? base?.invitedBy ?? '',
    seats: row.seats ?? base?.seats ?? 12,
    fallbackVideoUrl: b.fallbackVideoUrl ?? base?.fallbackVideoUrl ?? '',
    status: row.status,
    startsAt: row.starts_at ?? undefined,
    doorsAt: row.doors_at ?? undefined,
    screen: row.screen?.screen_key,
  };
}

/** Minimal surface of the Supabase client this module uses, so tests can stub it. */
export interface ScheduleDb {
  from: typeof supabase.from;
  rpc: typeof supabase.rpc;
}
let db: ScheduleDb = supabase;
/** Tests only. */
export function setScheduleDb(next: ScheduleDb): void {
  db = next;
}

const COLUMNS =
  'slug, title, artist, billing, status, starts_at, doors_at, seats, ' +
  'screen:venues!performances_screen_id_fkey(screen_key), theater:venues!performances_theater_id_fkey!inner(slug)';

/** The stored performance, or null (none stored, table not there yet, or slow). Never rejects. */
export async function fetchPerformance(slug: string, theater: string = DEFAULT_THEATER_SLUG): Promise<PerformanceRow | null> {
  try {
    const q = db.from('performances').select(COLUMNS).eq('theater.slug', theater).eq('slug', slug).maybeSingle();
    const r = await Promise.race([
      Promise.resolve(q),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), LOAD_TIMEOUT_MS)),
    ]);
    if (r === 'timeout' || r.error || !r.data) return null;
    return r.data as unknown as PerformanceRow;
  } catch {
    return null;
  }
}

/** A theater's nights that are not filed, soonest first. Empty when the database has none. */
export async function listUpcoming(theater: string = DEFAULT_THEATER_SLUG): Promise<PerformanceRow[]> {
  try {
    const { data, error } = await db
      .from('performances')
      .select(COLUMNS)
      .eq('theater.slug', theater)
      .not('status', 'in', '(library,cancelled)')
      .order('starts_at', { ascending: true, nullsFirst: false });
    if (error || !data) return [];
    return data as unknown as PerformanceRow[];
  } catch {
    return [];
  }
}

export interface PerformanceFields {
  screen?: string;
  title?: string;
  artist?: string;
  billing?: PerformanceRow['billing'];
  status?: PerformanceStatus;
  starts_at?: string;
  doors_at?: string;
  ends_at?: string;
  seats?: number;
  shelf_screen_key?: string;
  publish_recording?: boolean;
  recording_url?: string;
  recording_note?: string;
}

export type SavePerformanceResult =
  | { ok: true; created: boolean; performance: PerformanceRow & Record<string, unknown> }
  | { ok: false; reason: string; detail?: string };

/** Schedule a night, or change one (status, times, recording). The database checks who may. */
export async function savePerformance(theater: string, slug: string, fields: PerformanceFields): Promise<SavePerformanceResult> {
  const { data, error } = await db.rpc('save_performance', { p: { ...fields, theater, slug } });
  if (error) return { ok: false, reason: 'error', detail: error.message };
  return data as SavePerformanceResult;
}

/**
 * The show for a slug: the compiled one at once (if any), then the stored row
 * when it arrives. `loading` is true only while a show with no compiled copy
 * is still being looked up.
 */
export function useScheduledShow(slug: string, theater: string = DEFAULT_THEATER_SLUG): { show: Show | null; loading: boolean } {
  const compiled = getShow(slug);
  const [state, setState] = useState<{ key: string; show: Show | null; done: boolean }>({ key: '', show: null, done: false });
  const key = `${theater}/${slug}`;
  useEffect(() => {
    let live = true;
    fetchPerformance(slug, theater).then((row) => {
      if (live) setState({ key, show: row ? rowToShow(row, getShow(slug)) : null, done: true });
    });
    return () => { live = false; };
  }, [key, slug, theater]);
  const fresh = state.key === key;
  const show = (fresh && state.show) || compiled;
  return { show, loading: !show && !(fresh && state.done) };
}
