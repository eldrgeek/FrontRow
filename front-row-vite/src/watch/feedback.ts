// One viewer's feedback on one video: kept in this browser, and sent to
// /api/video-feedback (server/video-feedback.mjs) after each change.
import catalog from './videos.json';

export type Thumb = 'up' | 'down';
export interface Scene { id: string; label: string; start: number; end: number; says?: string }
export interface Video { slug: string; title: string; youtubeId: string; duration: number; scenes: Scene[] }
export interface Feedback {
  viewer: string;
  reactions: Record<string, Thumb>;
  details: Record<string, string>;
  comment: string;
  contact: string;
  wantsDetail: boolean | null;
  finished: boolean;
}

export const VIDEOS: Video[] = catalog.videos;
export const findVideo = (slug: string | undefined) => VIDEOS.find((v) => v.slug === slug) || null;

export function sceneAt(video: Video, t: number): Scene {
  return video.scenes.find((s) => t >= s.start && t < s.end) || video.scenes[video.scenes.length - 1];
}

function newViewerId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return 'v_' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

const key = (slug: string) => `frontrow_watch_${slug}`;

export function loadFeedback(slug: string): Feedback {
  const fresh: Feedback = { viewer: newViewerId(), reactions: {}, details: {}, comment: '', contact: '', wantsDetail: null, finished: false };
  try {
    const raw = localStorage.getItem(key(slug));
    if (!raw) return fresh;
    const j = JSON.parse(raw);
    if (typeof j?.viewer !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(j.viewer)) return fresh;
    return { ...fresh, ...j };
  } catch {
    return fresh;
  }
}

export function storeFeedback(slug: string, f: Feedback): void {
  try {
    localStorage.setItem(key(slug), JSON.stringify(f));
  } catch {
    /* private window: the server copy is the only one */
  }
}

export type SendResult = 'sent' | 'not-set-up' | 'failed';

export async function sendFeedback(video: Video, f: Feedback): Promise<SendResult> {
  const scenes = new Set(video.scenes.map((s) => s.id));
  const details = Object.fromEntries(Object.entries(f.details).filter(([k, v]) => scenes.has(k) && v.trim()));
  try {
    const r = await fetch('/api/video-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video: video.slug,
        viewer: f.viewer,
        reactions: Object.fromEntries(Object.entries(f.reactions).filter(([k]) => scenes.has(k))),
        details,
        comment: f.comment,
        contact: f.contact,
        wantsDetail: f.wantsDetail,
        finished: f.finished,
      }),
    });
    if (r.ok) return 'sent';
    if (r.status === 503) return 'not-set-up';
    return 'failed';
  } catch {
    return 'failed';
  }
}

export const fmtTime = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
