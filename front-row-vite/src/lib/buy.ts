// Ticket sales client (server rules: server/box-office-pay.mjs). Public: no sign-in.
export interface BuyInfo {
  show: { title: string; artist: string; theater: string; startsAt: string | null; doorsAt: string | null; endsAt: string | null };
  onSale: boolean;
  closed: { reason: string; text: string } | null;
  seatsLeft: number;
  price: { currency: string; min: number; max: number; suggested: number[] };
  payee: string;
}
export interface Claim {
  state: 'pending' | 'paid' | 'revoked';
  text?: string;
  email?: string;
  emailed?: boolean;
  amount?: string;
  code?: string;
  link?: string;
}

async function call<T>(name: string, init: RequestInit, query?: Record<string, string>): Promise<T> {
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const r = await fetch(`/api/${name}${qs}`, { ...init, headers: { 'Content-Type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Something went wrong (${r.status})`), { status: r.status, body: j });
  return j as T;
}

export const buy = {
  info: (venue: string, room: string, performance: string) => call<BuyInfo>('buy-info', { method: 'GET' }, { venue, room, performance }),
  checkout: (body: { venue: string; room: string; performance: string; email: string; name: string; amount: number; timeZone: string }) =>
    call<{ url: string }>('buy-checkout', { method: 'POST', body: JSON.stringify(body) }),
  claim: (sessionId: string) => call<Claim>('buy-claim', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) }),
};

export const dollars = (cents: number) => (cents % 100 ? `$${(cents / 100).toFixed(2)}` : `$${cents / 100}`);
