// ─────────────────────────────────────────────────────────────────────────────
// appAdmin.ts — server-side "is this caller a FrontRow admin?" gate.
//
// The flywheel's admin actions (accept feedback into the build queue, start a
// build, append a changelog entry) must be admin-only. The canonical source of
// truth is the shared `app_roles` model with the `is_app_admin('frontrow')`
// helper — Mike is seeded there (both app='frontrow' and the '*' wildcard).
//
// Two-tier gate, in preference order:
//   1. AUTHORITATIVE: call the is_app_admin RPC with the caller's JWT. Same
//      fact RLS uses, so the edge gate and the DB gate never diverge.
//   2. FALLBACK: an email allow-list (Mike's two identities), for the window
//      where the RPC isn't reachable or the account isn't yet seeded.
//
// Either tier passing = admin.
// ─────────────────────────────────────────────────────────────────────────────

import { requireUser, AuthError, type AuthedUser } from './auth';

const APP = 'frontrow';

// Fallback allow-list. Migrate to app_roles (RPC) once these users have SOMA
// accounts. Jess Jessop + George Coveney named as FrontRow admins in the
// 2026-07-08 review meeting ("grant Jess and George admin access").
const ADMIN_EMAILS = [
  'mw@mike-wolf.com',
  'mike@embeddedsystemsresearch.org',
  'dwjessop@gmail.com',
  'gtcoveney@gmail.com',
];

/**
 * Verify the caller and confirm FrontRow-admin. Throws AuthError(401) if the
 * token is bad, AuthError(403) if the user is not an admin. Returns the user.
 */
export async function requireFrontrowAdmin(
  authHeader: string | undefined,
): Promise<AuthedUser> {
  const user = await requireUser(authHeader);
  if (!(await isFrontrowAdmin(user))) throw new AuthError('Admins only', 403);
  return user;
}

/**
 * Non-throwing admin check for a caller already resolved via requireUser (or
 * null for anonymous, which always returns false). Used by the soma-feedback
 * widget intake, where "not an admin" is a normal routing outcome (review
 * queue), not an error.
 */
export async function isFrontrowAdmin(user: AuthedUser | null): Promise<boolean> {
  if (!user) return false;
  if (await rpcIsAppAdmin(user.token)) return true;
  const email = (user.email || '').toLowerCase();
  return !!email && ADMIN_EMAILS.includes(email);
}

/**
 * Call the is_app_admin('frontrow') RPC with the caller's JWT (anon key + their
 * bearer). Returns false on any error/misconfig so the allow-list can still
 * gate; never throws — a flaky RPC must degrade to the fallback, not 500.
 */
async function rpcIsAppAdmin(token: string): Promise<boolean> {
  try {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !anon) return false;

    const resp = await fetch(`${url}/rest/v1/rpc/is_app_admin`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target_app: APP }),
    });
    if (!resp.ok) return false;
    const val = await resp.json();
    return val === true;
  } catch {
    return false;
  }
}
