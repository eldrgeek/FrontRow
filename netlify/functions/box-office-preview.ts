// POST /api/box-office-preview: Preview a mailing: who would get a ticket, from whom, and the letter. Issues nothing.
// Rules: server/box-office.mjs. Callers: a FrontRow admin, the venue's theater
// manager (signed in), or a manager ticket inside its own scope.
import { handleMailPreview } from '../../server/box-office.mjs';
import { wrapBox } from './lib/boxOffice';

export const handler = wrapBox({ POST: handleMailPreview });
