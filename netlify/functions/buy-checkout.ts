// /api/buy-checkout (POST). Public: a Stripe Checkout Session for one pay-what-you-want ticket.
// Rules: server/box-office-pay.mjs.
import { handleCheckout } from '../../server/box-office-pay.mjs';
import { wrapPay } from './lib/pay';

export const handler = wrapPay({ POST: handleCheckout });
