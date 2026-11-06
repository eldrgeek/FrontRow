// POST /api/performance-recording {theater, performance, url, note?, publish?}:
// attach a YouTube recording to a performance (server/performances.mjs,
// handleAttachRecording). For the team, the performer, or the performer's AI,
// with a performer or manager ticket or a signed-in manager.
import { handleAttachRecording } from '../../server/performances.mjs';
import { wrap } from './lib/tickets';

export const handler = wrap(['POST'], handleAttachRecording);
