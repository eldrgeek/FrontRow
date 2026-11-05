// Types for tickets.mjs, so the TypeScript Netlify functions can import it.
export interface TicketRequest {
  authorization?: string;
  ticket?: string;
  device?: string;
  body?: any;
  query?: Record<string, string | undefined>;
  origin?: string;
}
export interface TicketUser { id: string; email: string | null; token: string }
export type Rpc = (fn: string, p: Record<string, unknown>) => Promise<any>;
export interface TicketDeps {
  rpc: Rpc | null;
  getUser: (authHeader: string) => Promise<TicketUser | null>;
  isAdmin: (user: TicketUser) => Promise<boolean>;
  now?: () => number;
  AccessToken?: any;
  TrackSource?: any;
  livekitKey?: string;
  livekitSecret?: string;
  mode?: 'stage' | 'all';
}
export interface HandlerResult { status: number; body: any }
export const ADMIN_EMAILS: string[];
export const ROLES: string[];
export const CHANNELS: string[];
export const ROOM_PATTERN: RegExp;
export const ROOM_ALIASES: Record<string, { venue: string; room: string }>;
export function livekitRoomFor(venue: string, room: string): string;
export function parseLivekitRoom(name: string): { venue: string; room: string } | null;
export function makeRpc(o: { url?: string; serviceKey?: string; fetchImpl?: typeof fetch }): Rpc | null;
export function makeGetUser(o: { url?: string; anonKey?: string; fetchImpl?: typeof fetch }): (h: string) => Promise<TicketUser | null>;
export function makeIsAdmin(rpc: Rpc | null): (u: TicketUser) => Promise<boolean>;
export function handleIssue(req: TicketRequest, deps: TicketDeps): Promise<HandlerResult>;
export function handleList(req: TicketRequest, deps: TicketDeps): Promise<HandlerResult>;
export function handleRevoke(req: TicketRequest, deps: TicketDeps): Promise<HandlerResult>;
export function handleCheck(req: TicketRequest, deps: TicketDeps): Promise<HandlerResult>;
export function handleToken(req: TicketRequest, deps: TicketDeps): Promise<HandlerResult>;
export interface Authority { who: string; any?: boolean; user?: TicketUser; managerCheck?: boolean; scope?: { venue: string; room: string | null; performance: string | null }; until?: number }
export function callerAuthority(req: TicketRequest, deps: TicketDeps): Promise<Authority | null>;
export function mayManage(auth: Authority | null, scope: { venue: string; room?: string | null; performance?: string | null }, deps: TicketDeps, issue?: { role: string; validUntil: number }): Promise<boolean>;
export const PUBLISH_SOURCES: Record<string, string[]>;
export function parseIssue(body: any, now?: number): any;
export function sha256(s: string): string;
export function newCode(): string;
export function isSlug(s: unknown, max?: number): boolean;
export function isReservedIdentity(s: unknown): boolean;
