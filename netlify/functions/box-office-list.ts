// GET /api/box-office-list: The box office view: every ticket in a scope, letters, door sales, seats, the Mac worker's state.
// Rules: server/box-office.mjs. Callers: a FrontRow admin, the venue's theater
// manager (signed in), or a manager ticket inside its own scope.
import { handleBoxList } from '../../server/box-office.mjs';
import { wrapBox } from './lib/boxOffice';

export const handler = wrapBox({ GET: handleBoxList });
