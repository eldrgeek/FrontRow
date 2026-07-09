// ─────────────────────────────────────────────────────────────────────────────
// escalateBuildRequest.ts — re-notify Rigg about a stale FrontRow build request.
//
// Files a fresh [BOARD] card addressed to Rigg (build master,
// SOMA/personas/rigg.md) framed as a follow-up, and stamps `last_escalated_at`
// so repeat sweeps don't spam the same request every run. Ported from
// Playmaker's lib/escalateBuildRequest.ts (app scope → 'frontrow').
//
// Called from check-stale-build-requests.ts (scheduled sweep) and
// escalate-build-request.ts (the admin's manual "Notify Rigg again" button).
// ─────────────────────────────────────────────────────────────────────────────

import { sendMail } from './smtp-send';

const APP = 'frontrow';

export interface EscalatableRequest {
  id: string;
  item_count: number;
  requested_at: string;
  status: string;
}

export async function escalateBuildRequest(
  url: string,
  serviceKey: string,
  request: EscalatableRequest,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = process.env.CLAUDE_EMAIL_ADDRESS;
  const pass = process.env.CLAUDE_EMAIL_PW;
  if (!user || !pass) {
    return { ok: false, error: 'Board-card email not configured (missing CLAUDE_EMAIL_ADDRESS/CLAUDE_EMAIL_PW).' };
  }

  const ageHours = Math.round((Date.now() - new Date(request.requested_at).getTime()) / 3600000);
  const subject = `[BOARD] frontrow build request stale (${ageHours}h): ${request.item_count} item${request.item_count === 1 ? '' : 's'} still ${request.status}`;
  const metaLines = [
    '<!--SOMA-CARD-META',
    'needs-mike: false',
    'auto-dispatch: true',
    'tags: [outer-loop, soma-feedback, build-batch, escalation]',
    'app: frontrow',
    'SOMA-CARD-META-->',
  ].join('\n');

  const body = [
    metaLines,
    '',
    `# FrontRow — build request stale (${ageHours}h)`,
    '',
    `Rigg (or whoever's picking this up): a build request has been sitting at status`,
    `\`${request.status}\` for about ${ageHours} hours with no progress reported. This is a`,
    're-notification, not a new ask — the original request is unchanged. Please either',
    'pick it up (advance to `in_progress`/`completed` via /api/update-build-request), or',
    'reply on this card if something is blocking it so the admin knows to intervene.',
    '',
    `Request id: ${request.id}`,
    `Items: ${request.item_count}`,
    `Originally requested: ${new Date(request.requested_at).toLocaleString()}`,
    '',
    '_Filed via the stale-request escalation — SOMA-APP-STANDARD.md §15a._',
  ].join('\n');

  try {
    await sendMail({
      host: 'smtp.gmail.com',
      port: 587,
      user,
      pass,
      from: user,
      to: user,
      subject,
      text: body,
    });
  } catch (err: any) {
    return { ok: false, error: err?.message || 'SMTP send failed' };
  }

  const patch = await fetch(`${url}/rest/v1/build_requests?id=eq.${request.id}&app=eq.${APP}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ last_escalated_at: new Date().toISOString() }),
  });
  if (!patch.ok) {
    console.error('escalateBuildRequest: last_escalated_at patch failed:', patch.status, await patch.text());
  }

  return { ok: true };
}
