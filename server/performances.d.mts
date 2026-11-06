// Types for performances.mjs, so the TypeScript Netlify functions can import it.
import type { TicketDeps, TicketRequest, HandlerResult, Rpc } from './tickets.mjs';
export { makeRpc } from './tickets.mjs';
export const STATUSES: string[];
export function guestMayEnter(status: string, role: string): boolean;
export function youtubeIdOf(url: string): string | null;
export function handleAttachRecording(req: TicketRequest, deps: TicketDeps): Promise<HandlerResult>;
export function shelveDue(rpc: Rpc): Promise<any>;
export function startLibraryJob(rpc: Rpc | null, ms: number, log?: Pick<Console, 'log' | 'warn'>): () => void;
export function followRoom(rpc: Rpc | null, house: { venue: string; room: string }, from: string, to: string): Promise<any>;
