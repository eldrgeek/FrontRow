// GET|POST /api/get-livekit-token: a LiveKit token for a frontrow-* room.
//
// The rules live in server/tickets.mjs (handleToken), shared with
// frontrow-server's /api/livekit-token. In short: a ticket (X-Frontrow-Ticket +
// X-Frontrow-Device) is redeemed and sets the role; without one, only a
// signed-in FrontRow admin may join as anything but audience or take the
// identity "performer". FRONTROW_TICKETS=all makes a ticket or admin required
// for everyone.
import { handleToken } from '../../server/tickets.mjs';
import { wrap } from './lib/tickets';

export const handler = wrap(['GET', 'POST'], handleToken);
