// ─────────────────────────────────────────────────────────────────────────────
// POST /api/dispatch-feedback — the "queue-in" edge of the improvement flywheel.
//
// A FrontRow admin dispatches one feedback item to the (separate, VPS-side)
// improvement worker. This function does exactly two service-role writes:
//   1. feedback.status → 'queued'   (so the worker's poll picks it up)
//   2. INSERT dispatch_runs(feedback_id, status='queued')  (the run record)
//
// It does NOT run any agent, open any branch, or touch the VPS. The worker is a
// later, separate task; this is only the queue it polls. Admin-gated via
// requireFrontrowAdmin (is_app_admin RPC, email allow-list fallback).
//
// Body:    { feedback_id: uuid }
// Returns: { ok: true, run: { id, status, feedback_id, created_at } }
// ─────────────────────────────────────────────────────────────────────────────

import { requireFrontrowAdmin } from './lib/appAdmin';
import { AuthError } from './lib/auth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const APP = 'frontrow';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handler(event: any) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  }

  try {
    await requireFrontrowAdmin(
      event.headers?.authorization || event.headers?.Authorization,
    );

    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return json(500, { error: 'Server missing Supabase config' });
    }

    const body = JSON.parse(event.body || '{}');
    const feedbackId = String(body.feedback_id || '').trim();
    if (!UUID_RE.test(feedbackId)) {
      return json(400, { error: 'feedback_id must be a valid uuid' });
    }

    const svc = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    };

    // Confirm the feedback row exists and belongs to this app (avoid queuing a
    // stray id, and keep the worker's poll scoped to frontrow feedback).
    const check = await fetch(
      `${url}/rest/v1/feedback?id=eq.${feedbackId}&app=eq.${APP}&select=id`,
      { headers: svc },
    );
    if (!check.ok) {
      return json(502, { error: `Feedback lookup failed (${check.status})` });
    }
    const rows = await check.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return json(404, { error: 'No such FrontRow feedback item' });
    }

    // 1) Flip the feedback status to 'queued' (the worker polls on this).
    const patch = await fetch(
      `${url}/rest/v1/feedback?id=eq.${feedbackId}&app=eq.${APP}`,
      {
        method: 'PATCH',
        headers: { ...svc, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'queued' }),
      },
    );
    if (!patch.ok) {
      const t = await patch.text();
      console.error('feedback status patch failed:', patch.status, t);
      return json(500, { error: 'Failed to queue feedback' });
    }

    // 2) Insert the dispatch_runs record (the run the worker claims + patches).
    const insert = await fetch(`${url}/rest/v1/dispatch_runs`, {
      method: 'POST',
      headers: { ...svc, Prefer: 'return=representation' },
      body: JSON.stringify({ feedback_id: feedbackId, status: 'queued' }),
    });
    if (!insert.ok) {
      const t = await insert.text();
      console.error('dispatch_runs insert failed:', insert.status, t);
      return json(500, { error: 'Failed to create dispatch run' });
    }
    const inserted = await insert.json();
    const run = Array.isArray(inserted) ? inserted[0] : inserted;

    return json(200, { ok: true, run });
  } catch (err: any) {
    if (err instanceof AuthError) return json(err.status, { error: err.message });
    console.error('dispatch-feedback error:', err);
    return json(500, { error: err?.message || 'Failed to dispatch feedback' });
  }
}

function json(statusCode: number, obj: unknown) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
