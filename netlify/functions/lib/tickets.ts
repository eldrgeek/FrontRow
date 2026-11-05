// ─────────────────────────────────────────────────────────────────────────────
// Netlify glue for the ticket core (server/tickets.mjs): builds its deps from
// this site's env, and turns a Netlify event into the core's plain request.
//
// The bearer code and device id travel in headers (X-Frontrow-Ticket,
// X-Frontrow-Device) or a POST body, never in a query string, so they stay out
// of access logs. Responses are no-store.
// ─────────────────────────────────────────────────────────────────────────────

import { AccessToken } from 'livekit-server-sdk';
import { makeRpc, type TicketDeps, type TicketRequest, type HandlerResult } from '../../../server/tickets.mjs';
import { requireUser } from './auth';
import { isFrontrowAdmin } from './appAdmin';

export const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, private',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Frontrow-Ticket, X-Frontrow-Device',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function deps(): TicketDeps {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  return {
    rpc: makeRpc({ url, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY }),
    getUser: async (h: string) => {
      try {
        return await requireUser(h);
      } catch {
        return null;
      }
    },
    isAdmin: (u) => isFrontrowAdmin(u),
    AccessToken,
    livekitKey: process.env.LIVEKIT_API_KEY,
    livekitSecret: process.env.LIVEKIT_API_SECRET,
    mode: process.env.FRONTROW_TICKETS === 'all' ? 'all' : 'stage',
  };
}


export function toRequest(event: any): TicketRequest {
  const h = Object.fromEntries(
    Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]),
  );
  let body: any = {};
  if (event.body) {
    try {
      body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
    } catch {
      body = {};
    }
  }
  const proto = h['x-forwarded-proto'] || 'https';
  return {
    authorization: h['authorization'],
    ticket: h['x-frontrow-ticket'] || (typeof body.ticket === 'string' ? body.ticket : undefined),
    device: h['x-frontrow-device'] || (typeof body.device === 'string' ? body.device : undefined),
    body,
    query: { ...(event.queryStringParameters || {}), ...(event.httpMethod === 'POST' ? pick(body) : {}) },
    origin: h['host'] ? `${proto}://${h['host']}` : undefined,
  };
}

function pick(b: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ['identity', 'role', 'room', 'performance', 'venue']) {
    if (typeof b?.[k] === 'string') out[k] = b[k];
  }
  return out;
}

export function respond(r: HandlerResult) {
  return { statusCode: r.status, headers: HEADERS, body: JSON.stringify(r.body) };
}

export function wrap(methods: string[], fn: (req: TicketRequest, d: TicketDeps) => Promise<HandlerResult>) {
  return async (event: any) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
    if (!methods.includes(event.httpMethod)) {
      return respond({ status: 405, body: { error: `${methods.join(' or ')} only` } });
    }
    try {
      return respond(await fn(toRequest(event), deps()));
    } catch (err: any) {
      console.error('[tickets]', err?.message || err);
      return respond({ status: 500, body: { error: 'Ticket service error' } });
    }
  };
}
