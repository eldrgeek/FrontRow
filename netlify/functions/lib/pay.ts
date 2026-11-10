// Netlify glue for ticket sales (server/box-office-pay.mjs): the box office
// deps plus Stripe, over its REST API (form-encoded; no SDK).
//
//   FRONTROW_STRIPE_SECRET_KEY      Minds Aligned, LLC's restricted or secret key
//                                   (Checkout Sessions: write). Unset = sales closed.
//   FRONTROW_STRIPE_WEBHOOK_SECRET  the whsec_ of this site's /api/stripe-webhook
//                                   endpoint; also keys the sold ticket codes.
//                                   Unset = sales closed.
import type { HandlerResult } from '../../../server/tickets.mjs';
import type { PayRequest, StripeApi } from '../../../server/box-office-pay.mjs';
import { boxDeps } from './boxOffice';
import { toRequest, respond } from './tickets';

const API = 'https://api.stripe.com/v1';

function stripeApi(key: string): StripeApi {
  const call = async (method: 'GET' | 'POST', path: string, form?: Record<string, string>) => {
    const r = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        'Stripe-Version': '2024-06-20',
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      // Stripe's message, never the key or the request.
      console.error('[stripe]', method, path.split('?')[0].replace(/cs_[A-Za-z0-9_]+/, 'cs_…'), r.status, j?.error?.type, j?.error?.code);
      throw Object.assign(new Error(`stripe ${r.status}`), { status: r.status });
    }
    return j;
  };
  return {
    createCheckout: (params) => call('POST', '/checkout/sessions', params),
    getSession: (id) => call('GET', `/checkout/sessions/${encodeURIComponent(id)}`),
  };
}

export function payDeps() {
  const key = process.env.FRONTROW_STRIPE_SECRET_KEY;
  return {
    ...boxDeps(),
    stripe: key ? stripeApi(key) : undefined,
    stripeWebhookSecret: process.env.FRONTROW_STRIPE_WEBHOOK_SECRET || undefined,
  };
}

export function wrapPay(handlers: Record<string, (req: PayRequest, d: any) => Promise<HandlerResult>>) {
  return async (event: any) => {
    if (event.httpMethod === 'OPTIONS') return respond({ status: 204, body: '' });
    const fn = handlers[event.httpMethod];
    if (!fn) return respond({ status: 405, body: { error: `${Object.keys(handlers).join(' or ')} only` } });
    const req: PayRequest = toRequest(event);
    const h = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    req.rawBody = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : '';
    req.signature = h['stripe-signature'];
    try {
      const r = await fn(req, payDeps());
      if (r.status >= 400) console.error('[pay]', event.path, r.status, r.body?.reason || r.body?.error);
      return respond(r);
    } catch (err: any) {
      console.error('[pay]', err?.message || err);
      return respond({ status: 500, body: { error: 'Ticket sales error' } });
    }
  };
}
