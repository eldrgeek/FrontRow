// Who may open the builder for a theater and approve changes to it, and which
// SOMA room is that theater's builder room.
//
// The source of truth is the builder grant in the theater records (migration
// 005, theater_roles): the RPC frontrow_builder_access(p_slug) returns
// {exists, can_build, can_approve, builder_room_id, status}; can_approve means
// theater manager. Until 005 is applied that RPC does not exist, and the
// builder falls back to FrontRow admins only (/api/am-i-frontrow-admin), with
// no saved room. Room creator status in SOMA Rooms never decides who may
// change a theater. theaterStore.ts's builderAccess() answers "no access" for
// any error, so this module calls the RPC itself to tell "005 not applied"
// apart from "no grant".

import { supabase } from '../lib/supabase';
import { setBuilderRoom } from '../theater/theaterStore';

export interface BuilderAccess {
  signedIn: boolean;
  /** May open the builder and edit through the panel. */
  canBuild: boolean;
  /** May approve an AI's proposal. */
  canApprove: boolean;
  /** The theater's builder room, from the record. Null when none is saved. */
  roomId: string | null;
  /** Where the answer came from, in words, for the page. */
  source: 'grant' | 'admin-fallback' | 'none';
}

const ACCESS_TIMEOUT_MS = 6000;

const NO: BuilderAccess = { signedIn: false, canBuild: false, canApprove: false, roomId: null, source: 'none' };

interface AccessRow { exists?: boolean; can_build?: boolean; can_approve?: boolean; builder_room_id?: string | null; status?: string }

export async function loadBuilderAccess(slug: string, accessToken: string | null): Promise<BuilderAccess> {
  if (!accessToken) return NO;
  const signedIn = { ...NO, signedIn: true };

  // No answer in time denies: the builder never opens on a guess.
  const grant = await Promise.race([
    supabase.rpc('frontrow_builder_access', { p_slug: slug }).then(
      (r) => r,
      () => ({ data: null, error: { message: 'unreachable', code: '' } }),
    ),
    new Promise<{ data: null; error: { message: string; code: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: 'timeout', code: '' } }), ACCESS_TIMEOUT_MS)),
  ]);
  if (!grant.error && grant.data) {
    const row = (Array.isArray(grant.data) ? grant.data[0] : grant.data) as AccessRow;
    const exists = row?.exists !== false;
    return {
      signedIn: true,
      canBuild: exists && !!row?.can_build,
      canApprove: exists && !!row?.can_approve,
      roomId: typeof row?.builder_room_id === 'string' ? row.builder_room_id : null,
      source: 'grant',
    };
  }
  // A missing function (005 not applied) falls back to admins. Any other error denies.
  const missing = grant.error && (grant.error.code === 'PGRST202' || /could not find the function|does not exist/i.test(grant.error.message));
  if (!missing) return signedIn;

  try {
    const r = await fetch('/api/am-i-frontrow-admin', { headers: { Authorization: `Bearer ${accessToken}` } });
    const j = r.ok ? await r.json() : null;
    if (j?.admin) return { signedIn: true, canBuild: true, canApprove: true, roomId: null, source: 'admin-fallback' };
  } catch {
    /* deny */
  }
  return signedIn;
}

/**
 * Record the builder room on the theater. The first builder's room wins: the
 * RPC returns the room that is stored, which may be someone else's. Null when
 * it could not be saved (005 not applied, or no grant).
 */
export async function saveBuilderRoom(slug: string, roomId: string): Promise<string | null> {
  const r = await setBuilderRoom(slug, roomId);
  return r.ok ? (typeof r.value === 'string' ? r.value : roomId) : null;
}
