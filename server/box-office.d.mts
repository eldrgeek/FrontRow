// Types for box-office.mjs, so the TypeScript Netlify functions can import it.
import type { TicketRequest, TicketDeps, HandlerResult } from './tickets.mjs';
export interface BoxDeps extends TicketDeps {
  mailPublicKey?: string;
  mailSender?: string;
  siteOrigin?: string;
  workerToken?: string;
  serviceKey?: string;
  seatsFor?: (scope: { venue: string; room: string | null; performance: string | null }) => Promise<number>;
  screensFor?: (venue: string) => Promise<string[] | null>;
  randomUUID?: () => string;
  mailWaitSeconds?: number;
}
type H = (req: TicketRequest, deps: BoxDeps) => Promise<HandlerResult>;
export const handleMailPreview: H;
export const handleMailSend: H;
export const handleDoor: H;
export const handleBoxList: H;
export const handleSold: H;
export const handleRetry: H;
export const handleWorkerClaim: H;
export const handleWorkerReport: H;
export const MAX_LETTERS: number;
export const MAX_DOOR: number;
export const DEFAULT_SEATS: number;
export const EMAIL_RE: RegExp;
export const NEVER_SEND: Set<string>;
export function parseGuestList(input: unknown): { recipients: { email: string; name: string | null }[]; refused: { entry: string; reason: string }[] };
export function composeLetter(payload: any, name: string | null, code: string | null): { subject: string; body: string };
export function generateMailKeys(): { publicKey: string; privateKey: string };
export function sealCode(code: string, publicKeyX: string, id: string, email: string): string;
export function unsealCode(sealed: string, publicKeyX: string, privateKeyD: string, id: string, email: string): string | null;
