// Handing an approved issueTickets op to the ticket service: POST
// /api/ticket-issue (netlify/functions/ticket-issue.ts, rules in
// server/tickets.mjs). The caller must be signed in as a FrontRow admin or the
// theater's manager; the server checks that, not this page.
//
// The service returns each ticket's code once. The codes are bearer secrets:
// they are shown to the person on this page and never go into the room's chat
// or the change history.

import { MAX_TICKETS, type IssueTicketsArgs } from './ops';

export interface IssuedTicket {
  id: string;
  code: string;
  link: string;
  holder: string | null;
  role: string;
  seat: string | null;
}

export type IssueResult =
  | { status: 'issued'; tickets: IssuedTicket[]; note: string }
  | { status: 'refused' | 'unavailable'; note: string };

export interface TicketIssuer {
  issue(theaterSlug: string, request: IssueTicketsArgs, accessToken: string | null): Promise<IssueResult>;
}

/** The body /api/ticket-issue takes, from a checked issueTickets op. */
export function ticketRequestBody(theaterSlug: string, a: IssueTicketsArgs): Record<string, unknown> {
  const body: Record<string, unknown> = {
    venue: theaterSlug,
    role: a.role,
    channel: a.channel,
    validFrom: a.validFrom,
    validUntil: a.validUntil,
    maxDevices: a.uses ?? 1,
  };
  if (a.scope !== 'venue') body.room = a.screen;
  if (a.scope === 'performance') body.performance = a.performance;
  if (a.seat) body.seat = a.seat;
  if (a.holders?.length) {
    // One ticket per holder; checkOp makes sure there are exactly count of them.
    body.holders = a.holders;
  } else {
    body.count = Math.min(a.count, MAX_TICKETS);
  }
  return body;
}

export const httpTicketIssuer: TicketIssuer = {
  async issue(theaterSlug, request, accessToken) {
    if (!accessToken) return { status: 'refused', note: 'Sign in to issue tickets.' };
    let r: Response;
    try {
      r = await fetch('/api/ticket-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(ticketRequestBody(theaterSlug, request)),
      });
    } catch {
      return { status: 'unavailable', note: 'The ticket service could not be reached. No tickets were made.' };
    }
    const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; tickets?: IssuedTicket[] } | null;
    if (r.status === 404) return { status: 'unavailable', note: 'The ticket service is not on this site yet. No tickets were made.' };
    if (!r.ok || !j?.ok || !Array.isArray(j.tickets)) {
      return { status: r.status >= 500 ? 'unavailable' : 'refused', note: `No tickets were made: ${j?.error || `the ticket service answered ${r.status}`}.` };
    }
    return { status: 'issued', tickets: j.tickets, note: `Made ${j.tickets.length} ticket${j.tickets.length === 1 ? '' : 's'}. Nothing was sent.` };
  },
};

export function builderTicketIssuer(): TicketIssuer {
  return httpTicketIssuer;
}
