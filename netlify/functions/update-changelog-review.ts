// ─────────────────────────────────────────────────────────────────────────────
// POST /api/update-changelog-review — set a changelog entry's review verdict.
//
// Mike's ask (2026-07-07): "changes need to have a review stage... mark it
// with some kind of a box with the choices of accept, change, or revert."
// This is a status label on the changelog row, not an automatic action —
// 'reverted' flags that an entry should be rolled back, it does not itself
// run `git revert` or touch any code. A human (or Rigg) reads the verdict
// and acts on it.
//
// Body:    { id: uuid, review_status: 'accepted'|'needs-change'|'reverted' }
// Returns: { ok: true, entry }
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
const ALLOWED = ['accepted', 'needs-change', 'reverted'];

export async function handler(event: any) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  }

  try {
    const admin = await requireFrontrowAdmin(event.headers?.authorization || event.headers?.Authorization);

    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return json(500, { error: 'Server missing Supabase config' });
    }

    const body = JSON.parse(event.body || '{}');
    const id = String(body.id || '').trim();
    const reviewStatus = String(body.review_status || '').trim();
    if (!UUID_RE.test(id)) return json(400, { error: 'id must be a valid uuid' });
    if (!ALLOWED.includes(reviewStatus)) {
      return json(400, { error: `review_status must be one of ${ALLOWED.join(', ')}` });
    }

    const resp = await fetch(`${url}/rest/v1/changelog?id=eq.${id}&app=eq.${APP}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        review_status: reviewStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: admin.id,
      }),
    });
    if (!resp.ok) {
      console.error('update-changelog-review patch failed:', resp.status, await resp.text());
      return json(500, { error: 'Failed to update changelog entry' });
    }
    const rows = await resp.json();
    const entry = Array.isArray(rows) ? rows[0] : rows;
    if (!entry) return json(404, { error: 'No such changelog entry' });

    return json(200, { ok: true, entry });
  } catch (err: any) {
    if (err instanceof AuthError) return json(err.status, { error: err.message });
    console.error('update-changelog-review error:', err);
    return json(500, { error: err?.message || 'Failed to update changelog entry' });
  }
}

function json(statusCode: number, obj: unknown) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
