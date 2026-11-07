// Box office API client (server rules: server/box-office.mjs). Every call
// carries the manager's sign-in, or their manager ticket.
import { tokenRequestHeaders } from './ticketPass';

export interface Scope { venue: string; room: string; performance: string }
export interface Recipient { email: string; name: string | null }
export interface Preview {
  recipients: Recipient[];
  refused: { entry: string; reason: string }[];
  sender: { email: string; display: string };
  subject: string;
  sample: string;
  mailReady: boolean;
}
export interface DoorCard { id: string; label: string; code: string; link: string }
export interface BoxTicket {
  id: string; role: string; channel: 'sent' | 'door' | 'comp'; holder: string | null; label: string | null;
  room_id: string | null; performance_id: string | null; valid_from: string; valid_until: string;
  max_devices: number; claimed: number; revoked_at: string | null;
  sold_at: string | null; sold_by: string | null; sold_note: string | null;
  mail: { id: string; email: string; state: 'queued' | 'sending' | 'sent' | 'failed'; error: string | null; retryable: boolean } | null;
}
export interface BoxList {
  tickets: BoxTicket[];
  summary: Record<string, number>;
  sender: { email: string; display: string };
  mailReady: boolean;
  screens: string[] | null;
  performance: { slug: string; title: string; artist: string; status: string; seats: number | null; startsAt: string | null; doorsAt: string | null; endsAt: string | null } | null;
  worker: { host: string; armed: boolean; lastSeenAt: string; connected: boolean } | null;
}

async function call<T>(name: string, method: 'GET' | 'POST', body?: unknown, query?: Record<string, string>): Promise<T> {
  // The manager's own sign-in (and a manager ticket, if they carry one).
  const headers: Record<string, string> = { ...(await tokenRequestHeaders()), 'Content-Type': 'application/json' };
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const r = await fetch(`/api/${name}${qs}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `${name} failed (${r.status})`), { status: r.status, body: j });
  return j as T;
}

const clean = (s: Scope) => ({ venue: s.venue, room: s.room, ...(s.performance ? { performance: s.performance } : {}) });

export const boxOffice = {
  list: (s: Scope) => call<BoxList>('box-office-list', 'GET', undefined, clean(s) as Record<string, string>),
  preview: (s: Scope, body: Record<string, unknown>) => call<Preview>('box-office-preview', 'POST', { ...clean(s), ...body }),
  send: (s: Scope, body: Record<string, unknown>, shown: string[]) =>
    call<{ batch: string; letters: { id: string; email: string; state: string }[] }>('box-office-send', 'POST', { ...clean(s), ...body, shown }),
  door: (s: Scope, body: Record<string, unknown>) =>
    call<{ cards: DoorCard[]; validFrom: string; validUntil: string }>('box-office-door', 'POST', { ...clean(s), ...body }),
  sold: (id: string, sold: boolean, note?: string) => call('box-office-sold', 'POST', { id, sold, note }),
  retry: (id: string) => call('box-office-retry', 'POST', { id }),
  revoke: (id: string) => call('ticket-revoke', 'POST', { id }),
};
