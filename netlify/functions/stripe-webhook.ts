// /api/stripe-webhook (POST). Stripe only (signature checked): makes the ticket once a session is paid.
// Rules: server/box-office-pay.mjs.
import { handleWebhook } from '../../server/box-office-pay.mjs';
import { wrapPay } from './lib/pay';

export const handler = wrapPay({ POST: handleWebhook });
