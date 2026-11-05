// POST /api/ticket-revoke {id}: revoke a ticket. Takes effect on the holder's
// next token request (every request re-reads the ticket). Same callers as
// ticket-issue, limited to tickets inside the caller's scope.
import { handleRevoke } from '../../server/tickets.mjs';
import { wrap } from './lib/tickets';

export const handler = wrap(['POST'], handleRevoke);
