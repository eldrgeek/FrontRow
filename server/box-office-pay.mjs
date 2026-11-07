// Front Row ticket sales: pay what you want, through Stripe Checkout
// (box office, 2026-11-07). Mike: "Payment should be to minds-aligned LLC",
// "Pay what you want for now". The money goes to Minds Aligned, LLC's Stripe
// account (the one inthefutureof.work already uses); stored by
// migrations/008_ticket_sales.sql.
//
// The path a buyer takes:
//
//  1. /buy/<theater>/<screen>/<night> shows the night (GET /api/buy-info) and
//     asks for a name, an email and an amount (suggested, or their own, from
//     MIN_CENTS to MAX_CENTS). POST /api/buy-checkout checks the night is on
//     sale and has a seat, and makes a Stripe Checkout Session with that one
//     price. Nothing is issued yet.
//  2. Stripe takes the money and sends the buyer to /buy/thanks?session_id=…
//  3. The ticket is made ONCE per paid session, by whichever comes first: the
//     webhook (POST /api/stripe-webhook, signature checked) or the thank-you
//     page (POST /api/buy-claim). Both ask Stripe for the session themselves;
//     neither trusts what the browser or the webhook body says about payment.
//     A sealed copy goes to the buyer by email through the Mac mail worker
//     (server/box-office.mjs), when ticket mail is set up.
//  4. The thank-you page shows the ticket link for 24 hours after payment.
//     The code is derived from the session id with a server secret
//     (codeFor), so the page can show it again on reload; only its hash is
//     stored, and the page shows it only if that hash is the one on the
//     ticket and the ticket is not revoked.
//
// The buyer writes nothing that reaches the letter except their own name: the
// show and theater names come from the database, so a paid checkout cannot be
// used to mail chosen words to a chosen address.
//
// Seats are checked when the checkout starts. Two buyers paying for the last
// seat at once both get a ticket: they paid, and a manager can see it.

import crypto from 'node:crypto';
import { isSlug, sha256 } from './tickets.mjs';
import { EMAIL_RE, NEVER_SEND, DEFAULT_SEATS, cleanLine, isTimeZone, sealCode } from './box-office.mjs';

export const CURRENCY = 'usd';
export const MIN_CENTS = 100;
export const MAX_CENTS = 50000;
export const SUGGESTED_CENTS = [500, 1000, 2000];
export const CLAIM_WINDOW_MS = 24 * 3600e3;
export const WEBHOOK_TOLERANCE_S = 300;
const ON_SALE = ['scheduled', 'tickets-out', 'doors', 'green-room', 'curtain'];
const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
const KIND = 'frontrow-ticket';

const res = (status, body) => ({ status, body });

// ── Pure helpers ────────────────────────────────────────────────────────────

/** The ticket code for a paid session: frt_ + 24 base64url characters, the
 *  same form newCode() makes. Domain-separated from the secret's other use. */
export function codeFor(secret, sessionId) {
  const mac = crypto.createHmac('sha256', secret).update(`frontrow-ticket-sale-code-v1\n${sessionId}`).digest('base64url');
  return `frt_${mac.slice(0, 24)}`;
}

/** Stripe-Signature check: "t=<unix>,v1=<hex>[,v1=…]", HMAC-SHA256 over
 *  "<t>.<raw body>". Returns null when good, else the reason. */
export function verifyStripeSignature(rawBody, header, secret, nowMs = Date.now(), tolerance = WEBHOOK_TOLERANCE_S) {
  if (!secret) return 'no webhook secret';
  if (typeof header !== 'string' || typeof rawBody !== 'string') return 'no signature';
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = Number((parts.find(([k]) => k === 't') || [])[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v || '');
  if (!Number.isFinite(t) || !sigs.length) return 'bad signature header';
  if (Math.abs(nowMs / 1000 - t) > tolerance) return 'signature too old';
  const want = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  const ok = sigs.some((s) => {
    if (!/^[0-9a-f]{64}$/.test(s)) return false;
    return crypto.timingSafeEqual(Buffer.from(s, 'hex'), want);
  });
  return ok ? null : 'signature does not match';
}

/** When a sold ticket opens the door: doors (or 30 minutes before the start)
 *  until an hour after the end (or 4 hours after the start). */
export function ticketWindow(night) {
  const starts = Date.parse(night.starts_at || '');
  const doors = Date.parse(night.doors_at || '');
  const ends = Date.parse(night.ends_at || '');
  const from = Number.isFinite(doors) ? doors : starts - 30 * 60e3;
  const until = Number.isFinite(ends) ? ends + 3600e3 : starts + 4 * 3600e3;
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from) return null;
  return { validFrom: new Date(from).toISOString(), validUntil: new Date(until).toISOString() };
}

export const money = (cents, currency = CURRENCY) =>
  `${currency === 'usd' ? '$' : ''}${(cents / 100).toFixed(2)}${currency === 'usd' ? '' : ` ${currency.toUpperCase()}`}`;

function scopeFrom(src) {
  const scope = { venue: src && src.venue, room: src && src.room, performance: src && src.performance };
  if (!isSlug(scope.venue, 40) || !isSlug(scope.room) || !isSlug(scope.performance, 60)) return null;
  return scope;
}

function siteOrigin(req, deps) {
  return (deps.siteOrigin || req.origin || '').replace(/\/$/, '');
}

const payReady = (deps) => !!(deps.stripe && deps.stripeWebhookSecret);

/** The night and whether it can be sold now. {fail} or {night, seats, left, window}. */
async function sellable(scope, deps) {
  const night = await deps.rpc('frontrow_ticket_sale_night', { venue_id: scope.venue, room_id: scope.room, slug: scope.performance });
  if (!night || !night.found) return { fail: res(404, { error: 'There is no such show on sale.', reason: 'no-performance' }) };
  const seats = Number.isInteger(night.seats) ? night.seats : (deps.seatsFor ? await deps.seatsFor(scope) : DEFAULT_SEATS);
  const left = Math.max(0, seats - Number(night.taken || 0));
  const window = ticketWindow(night);
  const now = deps.now ? deps.now() : Date.now();
  let closed = null;
  if (!ON_SALE.includes(night.status)) closed = night.status === 'cancelled' ? 'cancelled' : 'over';
  else if (!window) closed = 'no-time';
  else if (Date.parse(window.validUntil) <= now) closed = 'over';
  else if (left < 1) closed = 'sold-out';
  return { night, seats, left, window, closed };
}

const CLOSED_TEXT = {
  cancelled: 'This show was cancelled.',
  over: 'This show is over.',
  'no-time': 'This show has no time set yet, so it is not on sale.',
  'sold-out': 'This show is sold out.',
};

// ── Handlers: (req, deps) → {status, body}, as tickets.mjs. ─────────────────
// deps: rpc, stripe {createCheckout(params) → {id, url}, getSession(id) → session},
// stripeWebhookSecret, mailPublicKey?, siteOrigin?, seatsFor?, now?, randomUUID?

/** GET /api/buy-info?venue=&room=&performance=: what the buy page shows. Public. */
export async function handleBuyInfo(req, deps) {
  if (!deps.rpc) return res(503, { error: 'Tickets are not configured on this server' });
  const scope = scopeFrom(req.query);
  if (!scope) return res(400, { error: 'venue, room and performance must be slugs' });
  const s = await sellable(scope, deps);
  if (s.fail) return s.fail;
  const n = s.night;
  return res(200, {
    ok: true,
    show: { title: n.title, artist: n.artist || '', theater: n.theater, startsAt: n.starts_at, doorsAt: n.doors_at, endsAt: n.ends_at },
    onSale: !s.closed && payReady(deps),
    closed: s.closed ? { reason: s.closed, text: CLOSED_TEXT[s.closed] } : (payReady(deps) ? null : { reason: 'not-set-up', text: 'Online sales are not open yet.' }),
    seatsLeft: s.left,
    price: { currency: CURRENCY, min: MIN_CENTS, max: MAX_CENTS, suggested: SUGGESTED_CENTS },
    payee: 'Minds Aligned, LLC',
  });
}

/** POST /api/buy-checkout {venue, room, performance, email, name?, amount (cents),
 *  timeZone?}: a Stripe Checkout Session for one ticket. Returns {url}. Public. */
export async function handleCheckout(req, deps) {
  if (!deps.rpc) return res(503, { error: 'Tickets are not configured on this server' });
  if (!payReady(deps)) return res(503, { error: 'Online sales are not open yet.', reason: 'not-set-up' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const scope = scopeFrom(body);
  if (!scope) return res(400, { error: 'venue, room and performance must be slugs' });
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 120) return res(400, { error: 'Please give an email address we can send your ticket to', reason: 'email' });
  if (NEVER_SEND.has(email)) return res(400, { error: 'That address cannot receive tickets', reason: 'email' });
  const name = cleanLine(body.name, 80) || '';
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount < MIN_CENTS || amount > MAX_CENTS) {
    return res(400, { error: `Pay what you want, from ${money(MIN_CENTS)} to ${money(MAX_CENTS)}`, reason: 'amount' });
  }
  const tz = body.timeZone && isTimeZone(body.timeZone) ? body.timeZone : 'America/New_York';
  const origin = siteOrigin(req, deps);
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(origin) && !/^http:\/\/localhost(:\d+)?$/.test(origin)) {
    return res(500, { error: 'this server does not know its own site address' });
  }
  const s = await sellable(scope, deps);
  if (s.fail) return s.fail;
  if (s.closed) return res(409, { error: CLOSED_TEXT[s.closed], reason: s.closed });
  const n = s.night;
  const now = deps.now ? deps.now() : Date.now();
  const when = n.starts_at
    ? new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(n.starts_at))
    : '';
  const meta = { kind: KIND, venue: scope.venue, room: scope.room, performance: scope.performance, email, name, tz };
  const back = `${origin}/buy/${scope.venue}/${scope.room}/${scope.performance}`;
  const params = {
    mode: 'payment',
    submit_type: 'pay',
    customer_email: email,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': CURRENCY,
    'line_items[0][price_data][unit_amount]': String(amount),
    'line_items[0][price_data][product_data][name]': `Ticket: ${cleanLine(n.title, 80)}`.slice(0, 120),
    'line_items[0][price_data][product_data][description]': [n.artist, n.theater, when].filter(Boolean).join(' · ').slice(0, 300) || 'Front Row Theater',
    success_url: `${origin}/buy/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: back,
    // Stripe's shortest allowed; a seat is not held meanwhile.
    expires_at: String(Math.floor(now / 1000) + 30 * 60),
  };
  for (const [k, v] of Object.entries(meta)) {
    params[`metadata[${k}]`] = v;
    params[`payment_intent_data[metadata][${k}]`] = v;
  }
  let session;
  try {
    session = await deps.stripe.createCheckout(params);
  } catch (e) {
    return res(502, { error: 'The payment page could not be opened. Please try again.', reason: 'stripe' });
  }
  if (!session || typeof session.url !== 'string' || !/^https:\/\//.test(session.url)) {
    return res(502, { error: 'The payment page could not be opened. Please try again.', reason: 'stripe' });
  }
  return res(200, { ok: true, url: session.url, id: session.id });
}

/** Make (or find) the ticket for a session Stripe says is paid.
 *  Returns {fail} or {paid:false} or {paid:true, created, ticketId, revoked, code, sameCode, email, emailed, paidAt}. */
async function fulfil(session, deps, origin) {
  if (!session || !SESSION_ID.test(session.id || '')) return { fail: res(404, { error: 'No such purchase' }) };
  const m = session.metadata || {};
  if (m.kind !== KIND || session.mode !== 'payment') return { fail: res(404, { error: 'No such purchase' }) };
  if (session.payment_status !== 'paid') return { paid: false };
  const scope = scopeFrom(m);
  const email = String(m.email || '').toLowerCase();
  if (!scope || !EMAIL_RE.test(email)) return { fail: res(500, { error: 'That purchase is missing its show or email; we have it on record, please write to us.' }) };
  const night = await deps.rpc('frontrow_ticket_sale_night', { venue_id: scope.venue, room_id: scope.room, slug: scope.performance });
  const window = night && night.found ? ticketWindow(night) : null;
  if (!window) return { fail: res(409, { error: 'The show you paid for has no time set any more; please write to us for a refund.', reason: 'no-time' }) };
  const code = codeFor(deps.stripeWebhookSecret, session.id);
  const tz = m.tz && isTimeZone(m.tz) ? m.tz : 'America/New_York';
  const uuid = deps.randomUUID || crypto.randomUUID;
  const mailId = uuid();
  const name = cleanLine(m.name, 80) || null;
  const mail = deps.mailPublicKey && origin ? {
    id: mailId,
    sealed: sealCode(code, deps.mailPublicKey, mailId, email),
    payload: {
      theater: cleanLine(night.theater, 80) || 'Front Row Theater', show: cleanLine(night.title, 80) || 'the show', tz, origin,
      validFrom: window.validFrom, validUntil: window.validUntil, maxDevices: 1, role: 'audience', seat: null,
    },
  } : null;
  const paidAt = new Date((Number(session.created) || 0) * 1000 || (deps.now ? deps.now() : Date.now())).toISOString();
  const r = await deps.rpc('frontrow_ticket_sale_fulfil', {
    session_id: session.id,
    amount: Number(session.amount_total) || 0,
    currency: String(session.currency || CURRENCY).toLowerCase(),
    email, name, livemode: !!session.livemode, paid_at: paidAt,
    ticket: {
      code_hash: sha256(code), venue_id: scope.venue, room_id: scope.room, performance_id: scope.performance,
      valid_from: window.validFrom, valid_until: window.validUntil,
    },
    mail,
  });
  if (!r || !r.ok) return { fail: res(500, { error: 'Your payment went through but the ticket could not be made yet. Reload this page in a minute.' }) };
  return {
    paid: true, created: !!r.created, ticketId: r.ticket_id, revoked: !!r.revoked, sameCode: r.code_hash === sha256(code),
    code, email, emailed: !!r.mailed, paidAt,
  };
}

/** POST /api/buy-claim {session_id}: the thank-you page. Public; the session id
 *  is the buyer's receipt. Shows the ticket link for 24 hours after payment. */
export async function handleClaim(req, deps) {
  if (!deps.rpc) return res(503, { error: 'Tickets are not configured on this server' });
  if (!payReady(deps)) return res(503, { error: 'Online sales are not open yet.', reason: 'not-set-up' });
  const id = String((req.body && req.body.session_id) || '');
  if (!SESSION_ID.test(id)) return res(400, { error: 'That is not a purchase link' });
  let session;
  try {
    session = await deps.stripe.getSession(id);
  } catch (e) {
    if (e && e.status === 404) return res(404, { error: 'No such purchase' });
    return res(502, { error: 'We could not reach the payment service. Reload in a minute.' });
  }
  const f = await fulfil(session, deps, siteOrigin(req, deps));
  if (f.fail) return f.fail;
  if (!f.paid) return res(200, { ok: true, state: 'pending', text: 'Your payment has not come through yet. This page will check again.' });
  const now = deps.now ? deps.now() : Date.now();
  const showable = !f.revoked && f.sameCode && now - Date.parse(f.paidAt) < CLAIM_WINDOW_MS;
  const origin = siteOrigin(req, deps);
  return res(200, {
    ok: true,
    state: f.revoked ? 'revoked' : 'paid',
    email: f.email,
    emailed: f.emailed,
    amount: money(Number(session.amount_total) || 0, String(session.currency || CURRENCY).toLowerCase()),
    // The ticket itself, for the buyer's own browser only. Never logged.
    ...(showable ? { code: f.code, link: `${origin}/#ticket=${f.code}` } : {}),
  });
}

/** POST /api/stripe-webhook: checkout.session.completed and
 *  checkout.session.async_payment_succeeded make the ticket. req.rawBody is
 *  the body exactly as sent; req.signature the Stripe-Signature header. */
export async function handleWebhook(req, deps) {
  if (!deps.rpc || !payReady(deps)) return res(503, { error: 'not set up' });
  const bad = verifyStripeSignature(req.rawBody, req.signature, deps.stripeWebhookSecret, deps.now ? deps.now() : Date.now());
  if (bad) return res(400, { error: bad });
  let event;
  try { event = JSON.parse(req.rawBody); } catch { return res(400, { error: 'not JSON' }); }
  const type = event && event.type;
  if (type !== 'checkout.session.completed' && type !== 'checkout.session.async_payment_succeeded') {
    return res(200, { ok: true, ignored: type || 'unknown' });
  }
  const id = event.data && event.data.object && event.data.object.id;
  if (!SESSION_ID.test(id || '')) return res(200, { ok: true, ignored: 'no session' });
  if ((event.data.object.metadata || {}).kind !== KIND) return res(200, { ok: true, ignored: 'not a ticket' });
  // Ask Stripe, rather than trust the event body.
  let session;
  try { session = await deps.stripe.getSession(id); } catch { return res(502, { error: 'could not reach Stripe' }); }
  const f = await fulfil(session, deps, siteOrigin(req, deps));
  // A 5xx makes Stripe retry later; a ticket that cannot be made for good is
  // answered 200 so it is not retried forever, and is logged by the caller.
  if (f.fail) return f.fail.status >= 500 ? f.fail : res(200, { ok: false, error: f.fail.body.error });
  return res(200, { ok: true, paid: f.paid, created: !!f.created });
}
