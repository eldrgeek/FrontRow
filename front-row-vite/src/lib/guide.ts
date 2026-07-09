// ─────────────────────────────────────────────────────────────────────────────
// guide.ts — FrontRow client data layer for the SOMA feedback / build-queue /
// changelog flywheel (ported from Playmaker's guide.ts, feedback subset only —
// FrontRow has no V'Eric chat surface, so the manager-chat / guide-log / usage
// wrappers were dropped).
//
// Thin wrappers over the auth-gated Netlify functions plus a guarded read of
// the changelog table. Everything here degrades softly: a missing table or a
// failed best-effort read must never throw into the UI. Every write attaches
// the caller's Supabase access token as `Authorization: Bearer <token>` so the
// functions can verify is_app_admin('frontrow') server-side.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

const APP = 'frontrow';

export interface ChangelogEntry {
  id: string;
  app: string;
  title: string;
  body: string | null;
  created_at: string;
  review_status?: 'pending' | 'accepted' | 'needs-change' | 'reverted';
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

export interface FeedbackItem {
  id: string;
  type: 'bug' | 'feature';
  description: string;
  page_context: string | null;
  status: string;
  created_at: string;
  reporter_name?: string | null;
  reporter_email?: string | null;
  area?: string | null;
  source?: string | null;
  is_admin?: boolean;
}

/**
 * A batch "Start build" request. Tracks the lifecycle (requested ->
 * in_progress -> completed -> reviewed) so a second click of "Start build"
 * dedupes against an already-open request instead of filing a duplicate board
 * card, and so the needs-attention badge knows what's completed-but-not-yet-
 * reviewed. Rigg (SOMA/personas/rigg.md) is the addressee for
 * requested/in_progress; the admin closes the loop at reviewed.
 */
export interface BuildRequest {
  id: string;
  app: string;
  requested_by: string | null;
  requested_at: string;
  feedback_ids: string[];
  item_count: number;
  status: 'requested' | 'in_progress' | 'completed' | 'reviewed' | 'cancelled';
  started_at: string | null;
  completed_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string | null;
  last_escalated_at?: string | null;
}

/**
 * A run record for one feedback item dispatched to the improvement worker. The
 * app inserts it at status='queued'; the (separate) VPS worker later PATCHes
 * branch/pr_url/preview_url and advances status.
 */
export interface DispatchRun {
  id: string;
  feedback_id: string | null;
  status: string;
  branch: string | null;
  pr_url: string | null;
  preview_url: string | null;
  agent: string | null;
  summary: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Admin-only: read the feedback queue (the review side of the membrane).
 * Returns null for non-admins (the function 403s them, caller hides the inbox)
 * and [] for any other error.
 */
export async function listFeedback(): Promise<FeedbackItem[] | null> {
  try {
    const resp = await fetch('/api/list-feedback', {
      method: 'GET',
      headers: { ...(await authHeader()) },
    });
    if (resp.status === 403) return null; // not an admin
    if (!resp.ok) return [];
    const { feedback } = await resp.json();
    return (feedback ?? []) as FeedbackItem[];
  } catch {
    return [];
  }
}

/**
 * Read this app's changelog, newest first. Guarded: if the table doesn't exist
 * yet, returns [] instead of throwing so the UI builds and runs regardless.
 */
export async function listChangelog(): Promise<ChangelogEntry[]> {
  try {
    const { data, error } = await supabase
      .from('changelog')
      .select('*')
      .eq('app', APP)
      .order('created_at', { ascending: false });
    if (error) return [];
    return (data ?? []) as ChangelogEntry[];
  } catch {
    return [];
  }
}

/**
 * Admin-only: dispatch a feedback item into the build queue. Flips the feedback
 * to status='queued' and creates a dispatch_runs row server-side. Returns the
 * created run, or throws with the function's error message.
 */
export async function dispatchFeedback(feedbackId: string): Promise<DispatchRun> {
  const resp = await fetch('/api/dispatch-feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ feedback_id: feedbackId }),
  });
  if (!resp.ok) throw new Error(await errMsg(resp, 'Couldn’t dispatch'));
  const { run } = await resp.json();
  return run as DispatchRun;
}

/**
 * Admin-only: dismiss a review-queue item without sending it to the build
 * queue. Terminal (status='dismissed'), not a delete — stays in history.
 */
export async function dismissFeedback(feedbackId: string): Promise<void> {
  const resp = await fetch('/api/dismiss-feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ feedback_id: feedbackId }),
  });
  if (!resp.ok) throw new Error(await errMsg(resp, 'Couldn’t dismiss'));
}

/**
 * Admin-only: the "Build" trigger. Files one board card summarizing every
 * feedback row currently in the build queue (status='queued') and creates a
 * build_requests row for Rigg to pick up — does NOT dispatch or organize the
 * work itself. Item-level dedupe server-side: files a fresh request only for
 * items not already covered by an open request.
 */
export async function notifyBuildQueue(): Promise<{
  count: number;
  alreadyOpen: boolean;
  request?: BuildRequest;
}> {
  const resp = await fetch('/api/notify-build-queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
  });
  if (!resp.ok) throw new Error(await errMsg(resp, 'Couldn’t start the build'));
  const data = await resp.json();
  return {
    count: typeof data.count === 'number' ? data.count : 0,
    alreadyOpen: !!data.alreadyOpen,
    request: data.request,
  };
}

/**
 * Admin-only: read every build_requests row for this app (newest first).
 * Returns [] on any error so the admin page still renders.
 */
export async function listBuildRequests(): Promise<BuildRequest[]> {
  try {
    const resp = await fetch('/api/list-build-requests', {
      headers: { ...(await authHeader()) },
    });
    if (!resp.ok) return [];
    const { requests } = await resp.json();
    return Array.isArray(requests) ? requests : [];
  } catch {
    return [];
  }
}

/**
 * Admin-only: advance a build_requests row's lifecycle. 'reviewed' is what
 * clears the needs-attention badge's "completed and not reviewed" bucket;
 * 'cancelled' is the stale-request escape hatch.
 */
export async function updateBuildRequest(
  id: string,
  status: 'in_progress' | 'completed' | 'reviewed' | 'cancelled',
): Promise<BuildRequest> {
  const resp = await fetch('/api/update-build-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ id, status }),
  });
  if (!resp.ok) throw new Error(await errMsg(resp, 'Couldn’t update the build request'));
  const { request } = await resp.json();
  return request as BuildRequest;
}

/**
 * Admin-only: re-notify Rigg about a stale request right now, instead of
 * waiting for the scheduled sweep (check-stale-build-requests.ts).
 */
export async function escalateBuildRequest(id: string): Promise<void> {
  const resp = await fetch('/api/escalate-build-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ id }),
  });
  if (!resp.ok) throw new Error(await errMsg(resp, 'Couldn’t notify Rigg'));
}

/**
 * Admin-only: set a changelog entry's review verdict (accept / needs-change /
 * reverted) — a status label, not an automatic git action.
 */
export async function updateChangelogReview(
  id: string,
  reviewStatus: 'accepted' | 'needs-change' | 'reverted',
): Promise<ChangelogEntry> {
  const resp = await fetch('/api/update-changelog-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ id, review_status: reviewStatus }),
  });
  if (!resp.ok) throw new Error(await errMsg(resp, 'Couldn’t update the changelog entry'));
  const { entry } = await resp.json();
  return entry as ChangelogEntry;
}

/**
 * Admin-only: append a "What's new" changelog entry (used when a change ships).
 */
export async function appendChangelog(title: string, body?: string): Promise<void> {
  const resp = await fetch('/api/changelog-append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ title, body }),
  });
  if (!resp.ok) throw new Error(await errMsg(resp, 'Couldn’t append changelog'));
}

/** Pull the function's { error } message out of a failed response, with a
 *  status-stamped fallback. Never throws itself. */
async function errMsg(resp: Response, fallback: string): Promise<string> {
  let msg = `${fallback} (${resp.status})`;
  try {
    const j = await resp.json();
    if (j?.error) msg = j.error;
  } catch {
    /* ignore */
  }
  return msg;
}
