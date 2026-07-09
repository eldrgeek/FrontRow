// ─────────────────────────────────────────────────────────────────────────────
// POST /api/escalate-build-request — the admin's "Notify Rigg again" button.
//
// A stale request's default UI affordance used to be Cancel — give up on it.
// This is the other option: re-notify Rigg right now instead of waiting for
// the next scheduled sweep (check-stale-build-requests.ts). Same escalation
// logic either way (escalateBuildRequest.ts); this is just the on-demand path.
//
// Admin-gated via requireFrontrowAdmin.
// Body:    { id: uuid }
// Returns: { ok: true }
// ─────────────────────────────────────────────────────────────────────────────

import { requireFrontrowAdmin } from './lib/appAdmin';
import { AuthError } from './lib/auth';
import { escalateBuildRequest } from './lib/escalateBuildRequest';

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
    const id = String(body.id || '').trim();
    if (!UUID_RE.test(id)) return json(400, { error: 'id must be a valid uuid' });

    const resp = await fetch(
      `${url}/rest/v1/build_requests?id=eq.${id}&app=eq.${APP}&select=id,item_count,requested_at,status`,
      {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      },
    );
    if (!resp.ok) return json(502, { error: `Lookup failed (${resp.status})` });
    const rows = await resp.json();
    const request = Array.isArray(rows) ? rows[0] : null;
    if (!request) return json(404, { error: 'No such build request' });
    if (request.status !== 'requested' && request.status !== 'in_progress') {
      return json(400, { error: `Cannot escalate a request with status '${request.status}'` });
    }

    const result = await escalateBuildRequest(url, serviceKey, request);
    if (!result.ok) return json(502, { error: result.error });

    return json(200, { ok: true });
  } catch (err: any) {
    if (err instanceof AuthError) return json(err.status, { error: err.message });
    console.error('escalate-build-request error:', err);
    return json(500, { error: err?.message || 'Failed to escalate build request' });
  }
}

function json(statusCode: number, obj: unknown) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
