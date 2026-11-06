// /api/mail-work: the Mac ticket mail worker's only door (scripts/ticket-mail-worker.mjs).
// GET  ?limit=&host=&armed=1  check in and take queued letters (sealed codes)
// POST {id, ok, error?}       report one letter
// Auth: Authorization: Bearer <FRONTROW_MAIL_WORKER_TOKEN>. Rules: server/box-office.mjs.
import { handleWorkerClaim, handleWorkerReport } from '../../server/box-office.mjs';
import { wrapBox } from './lib/boxOffice';

export const handler = wrapBox({ GET: handleWorkerClaim, POST: handleWorkerReport });
