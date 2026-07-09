// ─────────────────────────────────────────────────────────────────────────────
// GET /api/list-build-requests — every build_requests row for this app.
//
// Drives two things: (1) the admin page's Build queue tab, so a request that's
// already 'requested'/'in_progress' disables the "Start build" button instead
// of allowing a duplicate notification; (2) the needs-attention badge's
// "completed and not reviewed" bucket.
//
// Admin-gated via requireFrontrowAdmin. Reads with the service-role key
// (build_requests SELECT is admin-only under RLS, but the app's own anon
// client would need the caller's JWT threaded through — service-role here
// matches list-feedback.ts's existing pattern).
// ─────────────────────────────────────────────────────────────────────────────

import { requireFrontrowAdmin } from './lib/appAdmin';
import { AuthError } from './lib/auth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const APP = 'frontrow';

export async function handler(event: any) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  try {
    await requireFrontrowAdmin(event.headers?.authorization || event.headers?.Authorization);

    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return json(500, { error: 'Server missing Supabase config' });
    }

    const resp = await fetch(
      `${url}/rest/v1/build_requests?app=eq.${APP}&order=requested_at.desc&limit=100`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!resp.ok) {
      return json(502, { error: `build_requests read failed (${resp.status})` });
    }
    const requests = await resp.json();
    return json(200, { requests });
  } catch (err: any) {
    if (err instanceof AuthError) return json(err.status, { error: err.message });
    return json(500, { error: err?.message || 'Failed to list build requests' });
  }
}

function json(statusCode: number, obj: unknown) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
