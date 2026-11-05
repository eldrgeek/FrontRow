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
  RoomStatus,
  TheaterStatus,
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
  return { venueId: null, screenVenueIds: {}, version: 0, definition, source: 'built-in', status: 'open', roomStatus: {}, builderRoomId: null };
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
  status?: TheaterStatus | RoomStatus;
  builder_room_id?: string | null;
}

const COLS_003 = 'id, slug, screen_key, super_venue_id';
const COLS_005 = `${COLS_003}, status, builder_room_id`;

/** Reads venues with 005's columns, or without them while 005 is not applied. */
async function selectVenues(build: (cols: string) => PromiseLike<{ data: unknown; error: unknown }>): Promise<{ data: unknown; error: unknown }> {
  const first = await build(COLS_005);
  if (!first.error) return first;
  return build(COLS_003);
}

/**
 * Reads a theater's stored record. Returns null when the database has nothing
 * usable for this slug (callers then use the built-in copy).
 */
export async function fetchStoredTheater(slug: string): Promise<TheaterRecord | null> {
  // Before migration 003, venues has no slug column; Front Row is still
  // reachable by its fixed id, and simply has no stored definition yet.
  let theater: VenueRow | null = null;
  const bySlug = await selectVenues((cols) => db.from('venues').select(cols).eq('slug', slug).is('super_venue_id', null).maybeSingle());
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
  const roomStatus: Record<string, RoomStatus> = {};
  const screens = await selectVenues((cols) => db.from('venues').select(cols).eq('super_venue_id', theater.id));
  if (!screens.error && Array.isArray(screens.data)) {
    for (const s of screens.data as VenueRow[]) {
      if (!s.screen_key) continue;
      screenVenueIds[s.screen_key] = s.id;
      if (s.status) roomStatus[s.screen_key] = s.status as RoomStatus;
    }
  }

  return {
    venueId: theater.id,
    screenVenueIds,
    version: row.version ?? 1,
    definition: definition as TheaterDefinition,
    source: 'database',
    status: (theater.status as TheaterStatus | undefined) ?? 'open',
    roomStatus,
    builderRoomId: theater.builder_room_id ?? null,
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

// ---------------------------------------------------------------------------
// Who may build, and the theater's life (migrations/005)
// ---------------------------------------------------------------------------

export interface BuilderAccess {
  /** False also for a draft or preview theater the caller may not build. */
  exists: boolean;
  canBuild: boolean;
  /** A theater manager: may approve proposals, invite builders and change status. */
  canApprove: boolean;
  builderRoomId: string | null;
  status: TheaterStatus | null;
}

const NO_ACCESS: BuilderAccess = { exists: false, canBuild: false, canApprove: false, builderRoomId: null, status: null };

/** Never rejects: no session, no 005, or no network all read as no access. */
export async function builderAccess(slug: string): Promise<BuilderAccess> {
  try {
    const { data, error } = await db.rpc('frontrow_builder_access', { p_slug: slug });
    if (error || !data) return NO_ACCESS;
    const r = data as { exists: boolean; can_build: boolean; can_approve: boolean; builder_room_id: string | null; status: TheaterStatus | null };
    return { exists: !!r.exists, canBuild: !!r.can_build, canApprove: !!r.can_approve, builderRoomId: r.builder_room_id ?? null, status: r.status ?? null };
  } catch {
    return NO_ACCESS;
  }
}

/** A theater manager or the holder of an unexpired builder grant for this theater. */
export async function isBuilder(slug: string): Promise<boolean> {
  return (await builderAccess(slug)).canBuild;
}

type Rpc<T> = { ok: true; value: T } | { ok: false; error: string };

async function call<T>(fn: string, args: Record<string, unknown>): Promise<Rpc<T>> {
  try {
    const { data, error } = await db.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    return { ok: true, value: data as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Stores the theater's builder room. The first builder's room wins: the
 * returned id is the stored one, which may not be the one passed in.
 */
export function setBuilderRoom(slug: string, roomId: string): Promise<Rpc<string>> {
  return call<string>('set_builder_room', { p_slug: slug, p_room_id: roomId });
}

/** FrontRow admins only. The new theater starts as a draft managed by `managerUserId`. */
export function createTheater(slug: string, blueprint: TheaterDefinition, managerUserId: string): Promise<Rpc<{ venue_id: string; version: number }>> {
  return call('create_theater', { p_slug: slug, p_blueprint: { ...blueprint, slug }, p_manager: managerUserId });
}

/** Theater managers only. 1 to 90 days. Returns the grant id. */
export function grantBuilder(slug: string, email: string, days = 30, note = ''): Promise<Rpc<string>> {
  return call<string>('grant_builder', { p_slug: slug, p_email: email, p_days: days, p_note: note });
}

export function revokeBuilderGrant(grantId: string): Promise<Rpc<boolean>> {
  return call<boolean>('revoke_builder_grant', { p_grant: grantId });
}

/** screenId null sets the theater's status; otherwise that screen's. */
export function setStatus(slug: string, screenId: string | null, status: TheaterStatus | RoomStatus): Promise<Rpc<string>> {
  return call<string>('set_venue_status', { p_slug: slug, p_screen: screenId, p_status: status });
}

export type TheaterRole = 'venue_manager' | 'performance_manager';

/** venue_manager takes screenId null; performance_manager names a screen. Returns the role id. */
export function grantRole(slug: string, screenId: string | null, userId: string, role: TheaterRole): Promise<Rpc<string>> {
  return call<string>('grant_theater_role', { p_slug: slug, p_screen: screenId, p_user: userId, p_role: role });
}

export function revokeRole(roleId: string): Promise<Rpc<boolean>> {
  return call<boolean>('revoke_theater_role', { p_role_id: roleId });
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
