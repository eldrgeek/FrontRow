// ─────────────────────────────────────────────────────────────────────────────
// POST /api/dismiss-feedback — admin triage action for the review queue.
//
// Companion to dispatch-feedback.ts (which accepts a review-queue item into
// the build queue). This is the other outcome: a reviewed item that isn't
// going to become work. Sets feedback.status='dismissed' — terminal, not
// deleted, so it stays visible in the admin page's history.
//
// Body:    { feedback_id: uuid }
// Returns: { ok: true }
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
    await requireFrontrowAdmin(event.headers?.authorization || event.headers?.Authorization);

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

    const patch = await fetch(
      `${url}/rest/v1/feedback?id=eq.${feedbackId}&app=eq.${APP}`,
      {
        method: 'PATCH',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ status: 'dismissed' }),
      },
    );
    if (!patch.ok) {
      console.error('dismiss-feedback patch failed:', patch.status, await patch.text());
      return json(500, { error: 'Failed to dismiss feedback' });
    }

    return json(200, { ok: true });
  } catch (err: any) {
    if (err instanceof AuthError) return json(err.status, { error: err.message });
    console.error('dismiss-feedback error:', err);
    return json(500, { error: err?.message || 'Failed to dismiss feedback' });
  }
}

function json(statusCode: number, obj: unknown) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
