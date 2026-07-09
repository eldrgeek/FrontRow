// ─────────────────────────────────────────────────────────────────────────────
// POST /api/update-build-request — advance a build_requests row's lifecycle.
//
// Three explicit stages (Mike, 2026-07-07): a "build in process" list
// (requested/in_progress — Rigg is actively working it), a "waiting review"
// list (completed — Rigg finished, admin hasn't signed off yet), and the
// changelog (only once genuinely reviewed/accepted — not before).
//
// requested -> in_progress -> completed -> reviewed. Rigg (or whoever's
// running the build) advances through 'completed' (moves the request from
// "in process" to "waiting review"); the admin who checks the result
// advances 'completed' -> 'reviewed' (moves it out of "waiting review" and
// into the changelog), which is what clears the needs-attention badge's
// "completed and not reviewed" bucket.
//
// 'cancelled' is the stale-request escape hatch (2026-07-07, per Mike:
// "if the build fails, maybe this hangs up") — if a request sits in
// requested/in_progress with no visible progress, an admin can cancel it.
// This does NOT touch the underlying feedback rows' status (they stay
// 'queued', genuinely unbuilt) — cancelling just closes out the tracking
// row so it stops blocking new "Start build" clicks for those same items
// (notify-build-queue.ts only excludes items covered by requested/
// in_progress rows; a cancelled row's items become requestable again).
//
// Marking a request 'completed' flips every feedback row in its
// feedback_ids snapshot from 'queued' to 'shipped' — the code IS live at
// this point (Rigg deployed it) — but it does NOT touch the changelog yet;
// otherwise the "what's new" feed would show unreviewed work before a human
// ever confirmed it. Marking 'reviewed' is what appends one changelog entry
// per item, per the three-stage model above. Auto-generated entries are a
// placeholder (title/body straight from the original ask) — Rigg or the
// reviewing admin should edit them via changelog-append's update path once
// real "what shipped" copy exists; better an unpolished entry than a
// silent one.
//
// Body:    { id: uuid, status: 'in_progress'|'completed'|'reviewed'|'cancelled', notes?: string }
// Returns: { ok: true, request }
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
const ALLOWED_STATUSES = ['in_progress', 'completed', 'reviewed', 'cancelled'];

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
    const status = String(body.status || '').trim();
    if (!UUID_RE.test(id)) return json(400, { error: 'id must be a valid uuid' });
    if (!ALLOWED_STATUSES.includes(status)) {
      return json(400, { error: `status must be one of ${ALLOWED_STATUSES.join(', ')}` });
    }
    const notes = typeof body.notes === 'string' ? body.notes.slice(0, 2000) : undefined;

    const patch: Record<string, unknown> = { status };
    if (status === 'in_progress') patch.started_at = new Date().toISOString();
    if (status === 'completed') patch.completed_at = new Date().toISOString();
    if (status === 'reviewed') {
      patch.reviewed_at = new Date().toISOString();
      patch.reviewed_by = admin.id;
    }
    if (notes !== undefined) patch.notes = notes;

    const resp = await fetch(`${url}/rest/v1/build_requests?id=eq.${id}&app=eq.${APP}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(patch),
    });
    if (!resp.ok) {
      console.error('update-build-request patch failed:', resp.status, await resp.text());
      return json(500, { error: 'Failed to update build request' });
    }
    const rows = await resp.json();
    const request = Array.isArray(rows) ? rows[0] : rows;
    if (!request) return json(404, { error: 'No such build request' });

    const svc = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    };

    // Stage 1 -> 2: "in process" -> "waiting review". The code is live now
    // (Rigg deployed it), so the feedback rows move to 'shipped' — but the
    // changelog stays untouched until a human actually reviews it.
    if (status === 'completed' && Array.isArray(request.feedback_ids) && request.feedback_ids.length > 0) {
      const idList = request.feedback_ids.join(',');
      const shipPatch = await fetch(
        `${url}/rest/v1/feedback?id=in.(${idList})&app=eq.${APP}&status=eq.queued`,
        {
          method: 'PATCH',
          headers: { ...svc, Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'shipped' }),
        },
      );
      if (!shipPatch.ok) {
        console.error('feedback status->shipped cascade failed:', shipPatch.status, await shipPatch.text());
      }
    }

    // Stage 2 -> 3: "waiting review" -> changelog. Only now, once an admin
    // has actually signed off, does "what got built" become a public
    // changelog entry — never before review.
    if (status === 'reviewed' && Array.isArray(request.feedback_ids) && request.feedback_ids.length > 0) {
      const idList = request.feedback_ids.join(',');
      const shippedResp = await fetch(
        `${url}/rest/v1/feedback?id=in.(${idList})&app=eq.${APP}&select=id,description`,
        { headers: svc },
      );
      if (!shippedResp.ok) {
        console.error('feedback read for changelog append failed:', shippedResp.status, await shippedResp.text());
      } else {
        const shippedRows: any[] = await shippedResp.json();
        if (Array.isArray(shippedRows) && shippedRows.length > 0) {
          const entries = shippedRows.map((f) => ({
            app: APP,
            title: String(f.description || '').slice(0, 60).replace(/\s+/g, ' ').trim() || 'Shipped an update',
            body: f.description || null,
          }));
          const clInsert = await fetch(`${url}/rest/v1/changelog`, {
            method: 'POST',
            headers: { ...svc, Prefer: 'return=minimal' },
            body: JSON.stringify(entries),
          });
          if (!clInsert.ok) {
            console.error('changelog auto-append failed:', clInsert.status, await clInsert.text());
          }
        }
      }
    }

    return json(200, { ok: true, request });
  } catch (err: any) {
    if (err instanceof AuthError) return json(err.status, { error: err.message });
    console.error('update-build-request error:', err);
    return json(500, { error: err?.message || 'Failed to update build request' });
  }
}

function json(statusCode: number, obj: unknown) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
