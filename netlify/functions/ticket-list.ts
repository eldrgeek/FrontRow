// GET /api/ticket-list?venue=&room=&performance=: tickets in a scope, with how
// many devices claimed each. No codes. Same callers as ticket-issue.
import { handleList } from '../../server/tickets.mjs';
import { wrap } from './lib/tickets';

export const handler = wrap(['GET'], handleList);
