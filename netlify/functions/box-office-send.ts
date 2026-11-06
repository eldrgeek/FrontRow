// POST /api/box-office-send: Issue the confirmed mailing's tickets and queue one sealed letter each for the Mac mail worker.
// Rules: server/box-office.mjs. Callers: a FrontRow admin, the venue's theater
// manager (signed in), or a manager ticket inside its own scope.
import { handleMailSend } from '../../server/box-office.mjs';
import { wrapBox } from './lib/boxOffice';

export const handler = wrapBox({ POST: handleMailSend });
