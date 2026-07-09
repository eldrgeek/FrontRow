// ─────────────────────────────────────────────────────────────────────────────
// POST /api/submit-feedback-widget — soma-feedback widget intake (SOMA-APP-
// STANDARD.md §8), wired into FrontRow's own feedback/dispatch_runs/changelog
// flywheel (0009_guide.sql, 0015_dispatch_runs.sql) instead of dead-ending in
// Supabase with no routing (the bug this replaces — see completions/
// 2026-07-06-frontrow-feedback-queue.md).
//
// Model (Mike's spec, 2026-07-06):
//   1. Run the same clarity check the VPS soma-feedback-svc uses — if the
//      message is too vague to act on, ask one focused question and let the
//      widget's multi-turn loop continue (stateless: full conversation
//      resent each turn).
//   2. Once accepted, resolve the caller's identity via the widget's optional
//      Authorization bearer (set by src/lib/somaFeedbackAuth.ts, a Supabase
//      access token) and check is_app_admin('frontrow').
//        - Admin (verified — never a client-supplied claim): insert into
//          `feedback` with status='queued' AND a matching `dispatch_runs`
//          row, straight into the build queue by virtue of privilege. No
//          separate accept step — that's the whole point of being an admin.
//        - Anyone else: insert into `feedback` with status='new' — the
//          ordinary review queue, same as V'Eric bug/feature reports.
//   3. Response tells the widget how many items are now queued so an admin
//      sees "Accepted. N items in queue" and can decide to keep adding
//      feedback or go start a build from the admin queue page.
//
// Body: { site, page, url, area, text, name, email, conversation, hp }
//   (matches soma-feedback.js's makePayload(); googleIdToken/adminToken are
//   ignored here — FrontRow uses its own Supabase session, not Google/Yeshie.)
// ─────────────────────────────────────────────────────────────────────────────

import { requireUser, AuthError } from './lib/auth';
import { isFrontrowAdmin } from './lib/appAdmin';
import { checkClarity } from './lib/feedbackClarity';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const APP = 'frontrow';
const MAX_TEXT_LENGTH = 4000;
const MAX_FIELD = 200;
const MAX_CONVERSATION_TURNS = 3;

export async function handler(event: any) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  }

  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return json(503, { error: 'Feedback backend not configured.' });
    }

    const payload = JSON.parse(event.body || '{}');

    // Honeypot: non-empty means a bot filled every field. Success-shaped
    // response so the bot learns nothing.
    if (typeof payload.hp === 'string' && payload.hp.trim().length > 0) {
      return json(200, { ok: true });
    }

    const text = String(payload.text || '').trim().slice(0, MAX_TEXT_LENGTH);
    if (!text) return json(400, { error: 'text is required' });

    const page = String(payload.page || '').trim().slice(0, MAX_FIELD);
    const pageUrl = String(payload.url || '').trim().slice(0, 500);
    const area = String(payload.area || '').trim().slice(0, MAX_FIELD) || null;
    const name = String(payload.name || 'anonymous').trim().slice(0, MAX_FIELD);
    const email = String(payload.email || '').trim().slice(0, MAX_FIELD) || null;

    let conversation = Array.isArray(payload.conversation) ? payload.conversation : [];
    conversation = conversation
      .filter((t: any) => t && typeof t.content === 'string' && (t.role === 'user' || t.role === 'assistant'))
      .slice(-20)
      .map((t: any) => ({ role: t.role, content: String(t.content).slice(0, MAX_TEXT_LENGTH) }));

    const clarifyTurnsSoFar = conversation.filter((t: any) => t.role === 'assistant').length;

    let clarity;
    try {
      if (clarifyTurnsSoFar >= MAX_CONVERSATION_TURNS) {
        clarity = { status: 'accepted' as const, question: '', title: text.slice(0, 60) };
      } else {
        clarity = await checkClarity(text, conversation);
      }
    } catch (err: any) {
      console.error('clarity check failed:', err?.message);
      return json(502, { error: 'Clarity check unavailable. Try again shortly.' });
    }

    if (clarity.status === 'clarify') {
      return json(200, { status: 'clarify', question: clarity.question });
    }

    // Resolve admin status from an optional bearer token (never a client
    // claim) — src/lib/somaFeedbackAuth.ts sends the visitor's own Supabase
    // access token via window.somaFeedbackAuthHeader.
    let isAdmin = false;
    let userId: string | null = null;
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (authHeader) {
      try {
        const authedUser = await requireUser(authHeader);
        userId = authedUser.id;
        isAdmin = await isFrontrowAdmin(authedUser);
      } catch {
        // Invalid/expired token — treat as anonymous, never as an error.
      }
    }

    const lowerText = text.toLowerCase();
    const type = /bug|broken|crash|error|not working|problem|issue/.test(lowerText) ? 'bug' : 'feature';

    const svc = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    };

    const row = {
      app: APP,
      user_id: userId,
      type,
      description: text,
      page_context: pageUrl || page || null,
      reporter_name: name,
      reporter_email: email,
      area,
      conversation: conversation.length ? conversation : null,
      source: 'soma-feedback-widget',
      is_admin: isAdmin,
      status: isAdmin ? 'queued' : 'new',
    };

    const insert = await fetch(`${url}/rest/v1/feedback`, {
      method: 'POST',
      headers: { ...svc, Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    if (!insert.ok) {
      const errText = await insert.text();
      console.error('feedback insert failed:', insert.status, errText);
      return json(500, { error: 'Failed to record feedback' });
    }
    const inserted = await insert.json();
    const feedbackRow = Array.isArray(inserted) ? inserted[0] : inserted;

    let queueCount: number | undefined;
    if (isAdmin) {
      // Straight into the build queue — admin privilege is the gate, no
      // separate accept step (Mike's spec: "build everything approved for
      // development by virtue of it being an admin who submitted it").
      const runInsert = await fetch(`${url}/rest/v1/dispatch_runs`, {
        method: 'POST',
        headers: { ...svc, Prefer: 'return=minimal' },
        body: JSON.stringify({ feedback_id: feedbackRow.id, status: 'queued' }),
      });
      if (!runInsert.ok) {
        console.error('dispatch_runs insert failed:', runInsert.status, await runInsert.text());
      }

      const countResp = await fetch(
        `${url}/rest/v1/feedback?app=eq.${APP}&status=eq.queued&select=id`,
        { headers: svc },
      );
      if (countResp.ok) {
        const rows = await countResp.json();
        queueCount = Array.isArray(rows) ? rows.length : undefined;
      }
    }

    const filedAt = new Date().toISOString();
    return json(200, {
      status: 'accepted',
      filedAt,
      build: isAdmin,
      ...(queueCount !== undefined ? { queueCount } : {}),
    });
  } catch (err: any) {
    if (err instanceof AuthError) return json(err.status, { error: err.message });
    console.error('submit-feedback-widget error:', err);
    return json(500, { error: err?.message || 'Failed to record feedback' });
  }
}

function json(statusCode: number, obj: unknown) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
