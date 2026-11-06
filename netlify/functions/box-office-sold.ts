// POST /api/box-office-sold: Mark a door card handed over (sold), or take the mark back.
// Rules: server/box-office.mjs. Callers: a FrontRow admin, the venue's theater
// manager (signed in), or a manager ticket inside its own scope.
import { handleSold } from '../../server/box-office.mjs';
import { wrapBox } from './lib/boxOffice';

export const handler = wrapBox({ POST: handleSold });
