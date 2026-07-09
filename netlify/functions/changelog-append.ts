// ─────────────────────────────────────────────────────────────────────────────
// POST /api/changelog-append — admin writes a "What's new" entry.
//
// The changelog table (migration 0009) is service-role-write-only (no client
// insert policy), so shipping a change surfaces as a "What's new" note only
// through this gated endpoint. Used at the tail of the flywheel: when a
// dispatched change actually ships, an admin records it here for writers to see.
//
// Admin-gated via requireFrontrowAdmin (is_app_admin RPC, email fallback).
//
// Body:    { title: string, body?: string }
// Returns: { ok: true, entry: { id, app, title, body, created_at } }
// ─────────────────────────────────────────────────────────────────────────────

import { requireFrontrowAdmin } from './lib/appAdmin';
import { AuthError } from './lib/auth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const APP = 'frontrow';
const MAX_BODY_BYTES = 16384;

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

    const bodyStr = event.body || '';
    if (Buffer.byteLength(bodyStr, 'utf8') > MAX_BODY_BYTES) {
      return json(413, { error: 'Request too large' });
    }

    const parsed = JSON.parse(bodyStr || '{}');
    const title = str(parsed.title, 200);
    if (!title) return json(400, { error: 'title is required' });
    const changeBody = str(parsed.body, 5000);

    const insert = await fetch(`${url}/rest/v1/changelog`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ app: APP, title, body: changeBody }),
    });
    if (!insert.ok) {
      const t = await insert.text();
      console.error('changelog insert failed:', insert.status, t);
      return json(500, { error: 'Failed to append changelog' });
    }
    const inserted = await insert.json();
    const entry = Array.isArray(inserted) ? inserted[0] : inserted;

    return json(200, { ok: true, entry });
  } catch (err: any) {
    if (err instanceof AuthError) return json(err.status, { error: err.message });
    console.error('changelog-append error:', err);
    return json(500, { error: err?.message || 'Failed to append changelog' });
  }
}

function str(val: unknown, max: number): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s.length > 0 ? s.slice(0, max) : null;
}

function json(statusCode: number, obj: unknown) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
