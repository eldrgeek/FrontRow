// GET /api/video-feedback-summary?video=<slug>: thumbs per scene and what
// viewers wrote. FrontRow admins only. Rules: server/video-feedback.mjs.
import { handleSummary } from '../../server/video-feedback.mjs';
import { wrapFeedback } from './lib/videoFeedback';

export const handler = wrapFeedback('GET', handleSummary);
