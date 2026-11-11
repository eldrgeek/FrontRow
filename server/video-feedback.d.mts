// Types for video-feedback.mjs, so the TypeScript Netlify functions can import it.
import type { TicketRequest, HandlerResult } from './tickets.mjs';
export interface Scene { id: string; label: string; start: number; end: number; says?: string }
export interface Video { slug: string; title: string; youtubeId: string; duration: number; scenes: Scene[] }
export interface Catalog { videos: Video[] }
export interface FeedbackDeps {
  catalog: Catalog;
  rpc: ((fn: string, p: Record<string, unknown>) => Promise<any>) | null;
  getUser?: (authorization: string | undefined) => Promise<any | null>;
  isAdmin?: (user: any) => Promise<boolean>;
}
type H = (req: TicketRequest, deps: FeedbackDeps) => Promise<HandlerResult>;
export const handleSave: H;
export const handleSummary: H;
export const LIMITS: { detail: number; comment: number; contact: number };
export function findVideo(catalog: Catalog, slug: unknown): Video | null;
export function parseSave(body: unknown, catalog: Catalog): { error: string } | { p: Record<string, unknown> };
