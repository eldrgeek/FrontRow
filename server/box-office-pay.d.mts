// Types for box-office-pay.mjs, so the TypeScript Netlify functions can import it.
import type { TicketRequest, HandlerResult } from './tickets.mjs';
import type { BoxDeps } from './box-office.mjs';
export interface StripeApi {
  createCheckout(params: Record<string, string>): Promise<{ id: string; url: string }>;
  getSession(id: string): Promise<any>;
}
export interface PayDeps extends BoxDeps {
  stripe?: StripeApi;
  stripeWebhookSecret?: string;
}
export interface PayRequest extends TicketRequest { rawBody?: string; signature?: string }
type H = (req: PayRequest, deps: PayDeps) => Promise<HandlerResult>;
export const handleBuyInfo: H;
export const handleCheckout: H;
export const handleClaim: H;
export const handleWebhook: H;
export const CURRENCY: string;
export const MIN_CENTS: number;
export const MAX_CENTS: number;
export const SUGGESTED_CENTS: number[];
export function codeFor(secret: string, sessionId: string): string;
export function verifyStripeSignature(rawBody: string, header: string, secret: string, nowMs?: number, tolerance?: number): string | null;
export function ticketWindow(night: { starts_at?: string | null; doors_at?: string | null; ends_at?: string | null }): { validFrom: string; validUntil: string } | null;
