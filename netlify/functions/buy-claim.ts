// /api/buy-claim (POST). Public: the thank-you page; makes the ticket once and shows it for 24 hours.
// Rules: server/box-office-pay.mjs.
import { handleClaim } from '../../server/box-office-pay.mjs';
import { wrapPay } from './lib/pay';

export const handler = wrapPay({ POST: handleClaim });
