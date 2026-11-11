// POST /api/video-feedback: one viewer's scene-by-scene reactions to a video on
// /watch/<video>. Public, no account. Rules: server/video-feedback.mjs.
import { handleSave } from '../../server/video-feedback.mjs';
import { wrapFeedback } from './lib/videoFeedback';

export const handler = wrapFeedback('POST', handleSave);
