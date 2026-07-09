// ─────────────────────────────────────────────────────────────────────────────
// POST /api/notify-build-queue — the admin's explicit "Build" trigger.
//
// Does NOT organize or dispatch any work itself — per Mike's spec (2026-07-06),
// "when the build is started it's the responsibility of the teammate running
// the build to decide how to organize it (workers, batching, etc.)". This
// endpoint's only job is to (1) dedupe against items ALREADY covered by an
// open build_requests row, and (2) file a request (board card + build_requests
// row) for whatever's left over.
//
// 2026-07-07 fix: the original dedupe check refused to file ANY new request
// while ONE open request existed for the app, full stop — so once a request
// went out, every item filed afterward piled up in the queue with no way to
// be requested until the first one resolved. That's a real hang risk Mike
// flagged directly ("if the build fails, maybe this hangs up"). The fix:
// dedupe is now item-level, not app-level. Compute which currently-queued
// items are NOT already covered by feedback_ids on any open (requested/
// in_progress) request; if that set is empty, return the existing covering
// request (alreadyOpen=true, same as before); if it's non-empty, file a NEW
// request for just the uncovered items — so multiple build_requests can be
// open concurrently, each its own board card, each Rigg's to sequence.
// "Suspense queue, or Rigg figures out how to orchestrate" (Mike's own
// framing) — the endpoint no longer decides that Rigg can't have two things
// in flight.
//
// Admin-gated via requireFrontrowAdmin.
// Returns: { ok: true, count, request: BuildRequest, alreadyOpen: boolean }
//   count=0 means nothing new to build — no card filed, no row created.
//   alreadyOpen=true means every currently-queued item is already covered by
//   an existing open request, returned as-is instead of creating a new one.
// ─────────────────────────────────────────────────────────────────────────────

import { requireFrontrowAdmin } from './lib/appAdmin';
import { AuthError } from './lib/auth';
import { sendMail } from './lib/smtp-send';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const APP = 'frontrow';

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
    const svc = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

    // Gather every currently-queued item and every open request's coverage,
    // then subtract — item-level dedupe, not app-level (see file header).
    const [queuedResp, openResp] = await Promise.all([
      fetch(
        `${url}/rest/v1/feedback?app=eq.${APP}&status=eq.queued&order=created_at.asc&select=id,type,description,page_context,area,reporter_name,reporter_email,created_at`,
        { headers: svc },
      ),
      fetch(
        `${url}/rest/v1/build_requests?app=eq.${APP}&status=in.(requested,in_progress)&order=requested_at.desc`,
        { headers: svc },
      ),
    ]);
    if (!queuedResp.ok) {
      return json(502, { error: `Queue read failed (${queuedResp.status})` });
    }
    const allQueued: any[] = await queuedResp.json();
    const openRequests: any[] = openResp.ok ? await openResp.json() : [];
    const coveredIds = new Set<string>(openRequests.flatMap((r: any) => r.feedback_ids || []));

    const items = Array.isArray(allQueued) ? allQueued.filter((it) => !coveredIds.has(it.id)) : [];

    if (items.length === 0) {
      if (openRequests.length > 0) {
        // Every queued item is already covered by an open request — return
        // the most recent one, same "nothing new to do" signal as before.
        return json(200, { ok: true, alreadyOpen: true, count: openRequests[0].item_count, request: openRequests[0] });
      }
      return json(200, { ok: true, count: 0, alreadyOpen: false });
    }

    const user = process.env.CLAUDE_EMAIL_ADDRESS;
    const pass = process.env.CLAUDE_EMAIL_PW;
    if (!user || !pass) {
      return json(503, { error: 'Board-card email not configured (missing CLAUDE_EMAIL_ADDRESS/CLAUDE_EMAIL_PW).' });
    }

    const subject = `[BOARD] frontrow build queue: ${items.length} item${items.length === 1 ? '' : 's'} ready`;
    const metaLines = [
      '<!--SOMA-CARD-META',
      'needs-mike: false',
      'auto-dispatch: true',
      'tags: [outer-loop, soma-feedback, build-batch]',
      'app: frontrow',
      'SOMA-CARD-META-->',
    ].join('\n');

    const itemLines = items.map((it: any, i: number) => {
      const loc = it.area ? ` — ${it.area}` : '';
      const who = it.reporter_name ? ` (${it.reporter_name})` : '';
      return `${i + 1}. [${it.type}]${loc}${who}: ${it.description}`;
    });

    const bodyLines = [
      metaLines,
      '',
      `# FrontRow — build queue: ${items.length} item${items.length === 1 ? '' : 's'} ready`,
      '',
      openRequests.length > 0
        ? `Note: ${openRequests.length} other build request${openRequests.length === 1 ? ' is' : 's are'} already open for this app — this is an ADDITIONAL batch, not a replacement. Rigg decides how to sequence them.`
        : null,
      openRequests.length > 0 ? '' : null,
      'Addressed to Rigg (build master, SOMA/personas/rigg.md) or whoever picks this',
      'up. Every item below already has a `dispatch_runs` row (status=queued) and is',
      'admin-approved for development. Decide batching/worker allocation and get',
      'started — nothing here has been organized or dispatched yet, this card is only',
      'the notification. Advance the matching `build_requests` row (see below) from',
      '`requested` to `in_progress` on pickup, `completed` when shipped.',
      '',
      '## Queued items',
      '',
      ...itemLines,
      '',
      '_Filed via /api/notify-build-queue — FrontRow admin queue page._',
    ].filter((l): l is string => l !== null);

    try {
      await sendMail({
        host: 'smtp.gmail.com',
        port: 587,
        user,
        pass,
        from: user,
        to: user,
        subject,
        text: bodyLines.join('\n'),
      });
    } catch (err: any) {
      console.error('notify-build-queue SMTP send failed:', err?.message);
      return json(502, { error: 'Could not file the build-queue card right now. Try again shortly.' });
    }

    const insert = await fetch(`${url}/rest/v1/build_requests`, {
      method: 'POST',
      headers: { ...svc, Prefer: 'return=representation' },
      body: JSON.stringify({
        app: APP,
        requested_by: admin.id,
        feedback_ids: items.map((it: any) => it.id),
        item_count: items.length,
        status: 'requested',
      }),
    });
    if (!insert.ok) {
      console.error('build_requests insert failed:', insert.status, await insert.text());
      // The card is already filed and the queue is real — surface the count
      // even if the tracking row failed, rather than pretending nothing happened.
      return json(200, { ok: true, count: items.length, alreadyOpen: false, warning: 'Notification sent but tracking row failed to save.' });
    }
    const inserted = await insert.json();
    const request = Array.isArray(inserted) ? inserted[0] : inserted;

    return json(200, { ok: true, count: items.length, alreadyOpen: false, request });
  } catch (err: any) {
    if (err instanceof AuthError) return json(err.status, { error: err.message });
    console.error('notify-build-queue error:', err);
    return json(500, { error: err?.message || 'Failed to notify build queue' });
  }
}

function json(statusCode: number, obj: unknown) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
