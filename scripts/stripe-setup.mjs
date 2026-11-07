#!/usr/bin/env node
// One-time go-live step for ticket sales (server/box-office-pay.mjs): make the
// Stripe webhook endpoint for this site on Minds Aligned, LLC's account and
// keep its signing secret in a mode-600 file. Prints no secret.
//
//   STRIPE_SECRET_KEY=sk_... node scripts/stripe-setup.mjs [--site https://frontrowtheater.netlify.app] [--out .env.stripe-frontrow]
//
// Idempotent: an endpoint already pointing at this URL is kept (Stripe shows a
// signing secret only when an endpoint is made, so an existing one needs its
// secret copied from the dashboard, or delete it and run this again).
// Then put FRONTROW_STRIPE_SECRET_KEY and FRONTROW_STRIPE_WEBHOOK_SECRET on the
// Netlify site (marked secret) and redeploy.
import fs from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const site = arg('--site', 'https://frontrowtheater.netlify.app').replace(/\/$/, '');
const out = arg('--out', '.env.stripe-frontrow');
const key = process.env.STRIPE_SECRET_KEY;
if (!key || !/^(sk|rk)_(test|live)_/.test(key)) { console.error('Set STRIPE_SECRET_KEY (sk_ or rk_) first.'); process.exit(2); }
const url = `${site}/api/stripe-webhook`;
const EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];

async function stripe(method, path, form) {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Stripe ${r.status}: ${j.error && j.error.message}`);
  return j;
}

const acct = await stripe('GET', '/account');
console.log(`Stripe account: ${acct.settings?.dashboard?.display_name || acct.business_profile?.name || acct.id} (${key.includes('_live_') ? 'LIVE' : 'test'} mode)`);
const list = await stripe('GET', '/webhook_endpoints?limit=100');
const have = list.data.find((e) => e.url === url);
if (have) {
  console.log(`An endpoint for ${url} already exists (${have.id}, ${have.status}). Its secret is in the Stripe dashboard.`);
  process.exit(0);
}
const form = { url, description: 'Front Row Theater ticket sales (pay what you want)' };
EVENTS.forEach((e, i) => { form[`enabled_events[${i}]`] = e; });
const ep = await stripe('POST', '/webhook_endpoints', form);
fs.writeFileSync(out, `FRONTROW_STRIPE_WEBHOOK_SECRET=${ep.secret}\n`, { mode: 0o600 });
console.log(`Made ${ep.id} for ${url}; its signing secret is in ${out} (mode 600).`);
