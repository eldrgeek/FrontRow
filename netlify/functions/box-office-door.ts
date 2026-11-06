// POST /api/box-office-door: Make printable door cards (codes come back once).
// Rules: server/box-office.mjs. Callers: a FrontRow admin, the venue's theater
// manager (signed in), or a manager ticket inside its own scope.
import { handleDoor } from '../../server/box-office.mjs';
import { wrapBox } from './lib/boxOffice';

export const handler = wrapBox({ POST: handleDoor });
