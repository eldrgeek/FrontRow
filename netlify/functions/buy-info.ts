// /api/buy-info (GET). Public: the night, seats left and the price range, for /buy.
// Rules: server/box-office-pay.mjs.
import { handleBuyInfo } from '../../server/box-office-pay.mjs';
import { wrapPay } from './lib/pay';

export const handler = wrapPay({ GET: handleBuyInfo });
