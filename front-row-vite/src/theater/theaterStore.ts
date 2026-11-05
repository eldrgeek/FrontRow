// Where theater definitions are kept: Supabase (migrations/003), with the
// compiled-in copies in definition.ts as the floor.
//
// Guests must never wait on, or be broken by, the database. loadTheater()
// therefore resolves to the built-in record whenever the database is slow,
// unreachable, has no stored definition yet, or holds one that fails
// validation. Saves are the opposite: they go to the database or fail loudly.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  BUILT_IN_THEATERS,
  DEFAULT_THEATER_SLUG,
  FRONT_ROW_VENUE_ID,
  TheaterDefinition,
  TheaterRecord,
  validateDefinition,
} from './definition';

const LOAD_TIMEOUT_MS = 2500;

export function builtInRecord(slug: string = DEFAULT_THEATER_SLUG): TheaterRecord | null {
  const definition = BUILT_IN_THEATERS[slug];
  if (!definition) return null;
  return { venueId: null, screenVenueIds: {}, version: 0, definition, source: 'built-in' };
}

/** Minimal surface of the Supabase client this module uses, so tests can stub it. */
export interface TheaterDb {
  from: typeof supabase.from;
  rpc: typeof supabase.rpc;
}

let db: TheaterDb = supabase;
/** Tests only. */
export function setTheaterDb(next: TheaterDb): void {
  db = next;
}

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms)),
  ]);
}

interface VenueRow {
  id: string;
  slug: string | null;
  screen_key: string | null;
  super_venue_id: string | null;
}

/**
 * Reads a theater's stored record. Returns null when the database has nothing
 * usable for this slug (callers then use the built-in copy).
 */
export async function fetchStoredTheater(slug: string): Promise<TheaterRecord | null> {
  // Before migration 003, venues has no slug column; Front Row is still
  // reachable by its fixed id, and simply has no stored definition yet.
  let theater: VenueRow | null = null;
  const bySlug = await db.from('venues').select('id, slug, screen_key, super_venue_id').eq('slug', slug).is('super_venue_id', null).maybeSingle();
  if (!bySlug.error && bySlug.data) theater = bySlug.data as VenueRow;
  else if (slug === DEFAULT_THEATER_SLUG) theater = { id: FRONT_ROW_VENUE_ID, slug, screen_key: null, super_venue_id: null };
  if (!theater) return null;

  const settings = await db.from('venue_settings').select('config, version').eq('venue_id', theater.id).maybeSingle();
  if (settings.error || !settings.data) return null;
  const row = settings.data as { config?: { definition?: unknown }; version?: number };
  const definition = row.config?.definition;
  if (!definition) return null;
  const problems = validateDefinition(definition);
  if (problems.length) {
    console.warn(`[theater] stored definition for "${slug}" is not usable; using the built-in copy`, problems);
    return null;
  }

  const screenVenueIds: Record<string, string> = {};
  const screens = await db.from('venues').select('id, screen_key').eq('super_venue_id', theater.id);
  if (!screens.error && screens.data) {
    for (const s of screens.data as VenueRow[]) if (s.screen_key) screenVenueIds[s.screen_key] = s.id;
  }

  return {
    venueId: theater.id,
    screenVenueIds,
    version: row.version ?? 1,
    definition: definition as TheaterDefinition,
    source: 'database',
  };
}

/** Never rejects. Resolves to the stored record, else the built-in one, else null (unknown slug). */
export async function loadTheater(slug: string = DEFAULT_THEATER_SLUG): Promise<TheaterRecord | null> {
  try {
    const stored = await withTimeout(fetchStoredTheater(slug), LOAD_TIMEOUT_MS);
    if (stored && stored !== 'timeout') return stored;
  } catch (err) {
    console.warn(`[theater] could not read "${slug}" from the database; using the built-in copy`, err);
  }
  return builtInRecord(slug);
}

export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; conflict: true; version: number; current: TheaterDefinition | null }
  | { ok: false; conflict: false; error: string };

/**
 * Saves a new version. `baseVersion` is the version the edit started from; if
 * someone saved in between, nothing is written and the current copy comes back.
 */
export async function saveTheater(slug: string, definition: TheaterDefinition, baseVersion: number, changeNote: string): Promise<SaveResult> {
  const problems = validateDefinition(definition);
  if (problems.length) return { ok: false, conflict: false, error: problems.join('; ') };
  if (definition.slug !== slug) return { ok: false, conflict: false, error: `definition.slug must be "${slug}"` };

  const { data, error } = await db.rpc('save_theater_definition', {
    p_slug: slug,
    p_definition: definition,
    p_base_version: baseVersion,
    p_change_note: changeNote,
  });
  if (error) return { ok: false, conflict: false, error: error.message };
  const r = data as { ok: boolean; version: number; conflict?: boolean; definition?: TheaterDefinition | null };
  if (r.ok) return { ok: true, version: r.version };
  return { ok: false, conflict: true, version: r.version, current: r.definition ?? null };
}

export interface TheaterChange {
  version: number;
  changeNote: string;
  changedBy: string | null;
  changedAt: string;
  definition: TheaterDefinition;
}

/** Newest first. Only the theater's manager and FrontRow admins can read these. */
export async function listChanges(slug: string, limit = 50): Promise<TheaterChange[]> {
  const theater = await db.from('venues').select('id').eq('slug', slug).is('super_venue_id', null).maybeSingle();
  if (theater.error || !theater.data) return [];
  const { data, error } = await db
    .from('theater_changes')
    .select('version, change_note, changed_by, changed_at, definition')
    .eq('venue_id', (theater.data as { id: string }).id)
    .order('version', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as Array<{ version: number; change_note: string; changed_by: string | null; changed_at: string; definition: TheaterDefinition }>).map((c) => ({
    version: c.version,
    changeNote: c.change_note,
    changedBy: c.changed_by,
    changedAt: c.changed_at,
    definition: c.definition,
  }));
}

/**
 * The theater for a page. Starts on the built-in record so the first paint is
 * the same as before records existed, then switches to the stored record if
 * the database has a valid one.
 */
export function useTheater(slug: string = DEFAULT_THEATER_SLUG): { record: TheaterRecord | null; loading: boolean } {
  const [record, setRecord] = useState<TheaterRecord | null>(() => builtInRecord(slug));
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setRecord(builtInRecord(slug));
    setLoading(true);
    loadTheater(slug).then((r) => {
      if (!live) return;
      setRecord(r);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [slug]);
  return { record, loading };
}
