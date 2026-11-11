// Netlify glue for scene-by-scene video feedback (server/video-feedback.mjs).
// Public saves need only the service key; the summary also checks the caller
// is a FrontRow admin (requireUser + isFrontrowAdmin, as every admin action).
import { makeRpc, type HandlerResult } from '../../../server/tickets.mjs';
import type { FeedbackDeps } from '../../../server/video-feedback.mjs';
import catalog from '../../../front-row-vite/src/watch/videos.json';
import { requireUser } from './auth';
import { isFrontrowAdmin } from './appAdmin';

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, private',
};

function deps(): FeedbackDeps {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  return {
    catalog,
    rpc: makeRpc({ url, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY }),
    getUser: async (h) => {
      try {
        return await requireUser(h);
      } catch {
        return null;
      }
    },
    isAdmin: (u) => isFrontrowAdmin(u),
  };
}

export function wrapFeedback(method: 'GET' | 'POST', fn: (req: any, d: FeedbackDeps) => Promise<HandlerResult>) {
  return async (event: any) => {
    if (event.httpMethod !== method) {
      return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: `${method} only` }) };
    }
    const h = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    let body: any = {};
    if (event.body) {
      try {
        body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
      } catch {
        body = {};
      }
    }
    try {
      const r = await fn({ authorization: h['authorization'], body, query: event.queryStringParameters || {} }, deps());
      if (r.status >= 500) console.error('[video-feedback]', event.path, r.status, r.body?.reason || r.body?.error);
      return { statusCode: r.status, headers: HEADERS, body: JSON.stringify(r.body) };
    } catch (err: any) {
      console.error('[video-feedback]', err?.message || err);
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Feedback service error' }) };
    }
  };
}
