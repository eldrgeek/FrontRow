// POST /api/ticket-check {ticket, device}: will this ticket let this device in,
// and when? Changes nothing (no device is claimed). For the lobby.
import { handleCheck } from '../../server/tickets.mjs';
import { wrap } from './lib/tickets';

export const handler = wrap(['POST'], handleCheck);
