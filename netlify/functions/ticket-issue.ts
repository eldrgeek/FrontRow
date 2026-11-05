// POST /api/ticket-issue: make tickets for a venue, room or performance.
// Body: {venue, room?, performance?, role, validFrom, validUntil, maxDevices?,
//        seat?, channel: sent|door|comp, holders?: string[], count?}
// Caller: a FrontRow admin, the venue's theater manager (signed in), or a
// manager ticket (X-Frontrow-Ticket + X-Frontrow-Device) inside its own scope.
// The codes come back once; only their hashes are stored. Rules: server/tickets.mjs.
import { handleIssue } from '../../server/tickets.mjs';
import { wrap } from './lib/tickets';

export const handler = wrap(['POST'], handleIssue);
