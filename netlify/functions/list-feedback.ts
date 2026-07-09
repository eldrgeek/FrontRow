// ─────────────────────────────────────────────────────────────────────────────
// GET/POST /api/list-feedback — the review side of the feedback membrane.
//
// Bugs/features captured by V'Eric or the soma-feedback widget land in
// `feedback` (app='frontrow'). This surfaces that queue to an ADMIN so "the
// team reviews these" is actually true. Auth-gated AND admin-gated via the
// same requireFrontrowAdmin gate every other admin action uses (is_app_admin
// RPC + email allow-list fallback) — reads with the service-role key
// (feedback SELECT is owner-only under RLS, so the queue is invisible otherwise).
// ─────────────────────────────────────────────────────────────────────────────

import { requireFrontrowAdmin } from './lib/appAdmin';
import { AuthError } from './lib/auth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export async function handler(event: any) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  try {
    await requireFrontrowAdmin(
      event.headers?.authorization || event.headers?.Authorization,
    );

    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return json(500, { error: 'Server missing Supabase config' });
    }

    const resp = await fetch(
      `${url}/rest/v1/feedback?app=eq.frontrow&order=created_at.desc&limit=200`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!resp.ok) {
      return json(502, { error: `Feedback read failed (${resp.status})` });
    }
    const feedback = await resp.json();
    return json(200, { feedback });
  } catch (err: any) {
    if (err instanceof AuthError) return json(err.status, { error: err.message });
    return json(500, { error: err?.message || 'Failed to list feedback' });
  }
}

function json(statusCode: number, obj: unknown) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
