// Netlify glue for the box office (server/box-office.mjs): the ticket deps
// from ./tickets plus the mail settings, all from this site's env.
//
//   FRONTROW_MAIL_PUBKEY        the Mac worker's X25519 public key (base64url).
//                               Unset = letters cannot be queued; nothing is issued.
//   FRONTROW_MAIL_WORKER_TOKEN  the worker's own token (at least 32 chars, not
//                               the service key). Unset = /api/mail-work answers 503.
//   FRONTROW_MAIL_SENDER        shown on the confirm (default claude@mike-wolf.com)
//   FRONTROW_SITE_ORIGIN        the site in ticket links (default: this request's host)
//   FRONTROW_SEATS              seats per room for the sold-out check (default 12)
import type { HandlerResult, TicketRequest } from '../../../server/tickets.mjs';
import { deps as ticketDeps, toRequest, respond } from './tickets';

// Front Row's screens before migration 003 stores them (theater/definition.ts).
const BUILT_IN_SCREENS: Record<string, string[]> = { 'front-row': ['revolution', 'live', 'library'] };

/** A theater's current screens from its definition record (migration 003:
 *  parent venues row by slug, child rows with screen_key). Falls back to the
 *  built-in list; null = unknown theater, no check. */
async function screensFor(venue: string): Promise<string[] | null> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fallback = BUILT_IN_SCREENS[venue] || null;
  if (!url || !key) return fallback;
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    const p = await fetch(`${url}/rest/v1/venues?select=id&slug=eq.${encodeURIComponent(venue)}`, { headers: h });
    if (!p.ok) return fallback;
    const [parent] = (await p.json()) as { id: string }[];
    if (!parent) return fallback;
    const c = await fetch(`${url}/rest/v1/venues?select=screen_key&super_venue_id=eq.${parent.id}`, { headers: h });
    if (!c.ok) return fallback; // 003 not applied: no screen_key column yet
    const keys = ((await c.json()) as { screen_key: string | null }[]).map((r) => r.screen_key).filter(Boolean) as string[];
    return keys.length ? keys : fallback;
  } catch {
    return fallback;
  }
}

export function boxDeps() {
  const seats = Number(process.env.FRONTROW_SEATS) || 12;
  return {
    ...ticketDeps(),
    mailPublicKey: process.env.FRONTROW_MAIL_PUBKEY || undefined,
    mailSender: process.env.FRONTROW_MAIL_SENDER || undefined,
    siteOrigin: process.env.FRONTROW_SITE_ORIGIN || undefined,
    workerToken: process.env.FRONTROW_MAIL_WORKER_TOKEN || undefined,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    seatsFor: async () => seats,
    screensFor,
  };
}

export function wrapBox(handlers: Record<string, (req: TicketRequest, d: any) => Promise<HandlerResult>>) {
  return async (event: any) => {
    if (event.httpMethod === 'OPTIONS') return respond({ status: 204, body: '' });
    const fn = handlers[event.httpMethod];
    if (!fn) return respond({ status: 405, body: { error: `${Object.keys(handlers).join(' or ')} only` } });
    try {
      return respond(await fn(toRequest(event), boxDeps()));
    } catch (err: any) {
      console.error('[box-office]', err?.message || err);
      return respond({ status: 500, body: { error: 'Box office error' } });
    }
  };
}
