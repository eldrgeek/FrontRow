// ─────────────────────────────────────────────────────────────────────────────
// Scheduled function — check-stale-build-requests
//
// Runs automatically (see netlify.toml's `schedule` config for this function)
// so a stale request gets re-notified to Rigg WITHOUT depending on an admin
// happening to open the Feedback Queue page. Per Mike (2026-07-07): a stale
// request's default response should be "go back to the build master," not
// just sit there until someone with the admin page open notices and cancels.
//
// No end-user auth — Netlify's scheduler invokes this directly (verified by
// Netlify's own event signing, not something this function needs to check
// itself; see Netlify's scheduled-functions docs). Runs every 30 minutes
// (netlify.toml); re-escalates a request at most once per STALE_REQUEST_MS
// window so it doesn't spam Rigg every single sweep while something's
// genuinely stuck.
// ─────────────────────────────────────────────────────────────────────────────

import { escalateBuildRequest } from './lib/escalateBuildRequest';

const APP = 'frontrow';
const STALE_REQUEST_MS = 2 * 60 * 60 * 1000; // matches FeedbackQueue.tsx's own threshold

export async function handler() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('check-stale-build-requests: missing Supabase config, skipping run');
    return { statusCode: 200, body: 'skipped (no config)' };
  }

  const resp = await fetch(
    `${url}/rest/v1/build_requests?app=eq.${APP}&status=in.(requested,in_progress)&select=id,item_count,requested_at,status,last_escalated_at`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!resp.ok) {
    console.error('check-stale-build-requests: read failed', resp.status, await resp.text());
    return { statusCode: 200, body: 'error reading build_requests' };
  }

  const rows: any[] = await resp.json();
  const now = Date.now();
  let escalated = 0;

  for (const r of rows) {
    const requestedAge = now - new Date(r.requested_at).getTime();
    if (requestedAge < STALE_REQUEST_MS) continue; // not stale yet

    const sinceLastEscalation = r.last_escalated_at ? now - new Date(r.last_escalated_at).getTime() : Infinity;
    if (sinceLastEscalation < STALE_REQUEST_MS) continue; // already escalated recently, don't spam

    const result = await escalateBuildRequest(url, serviceKey, r);
    if (result.ok) escalated += 1;
    else console.error(`check-stale-build-requests: escalation failed for ${r.id}:`, result.error);
  }

  return { statusCode: 200, body: `checked ${rows.length}, escalated ${escalated}` };
}
