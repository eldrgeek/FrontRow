// A Front Row ticket: a name and a show, kept in this browser. No account.
//
// localStorage holds it so the same link brings the guest back to their own
// ticket. Every access is wrapped: private windows and blocked storage throw,
// and the front door must still work then (the ticket just won't survive a
// reload). The legacy 3D app reads the guest's name from sessionStorage
// ('frontrow_user_name'), so issuing a ticket mirrors the name there too.

export interface Ticket {
  id: string;
  showSlug: string;
  name: string;
  issuedAt: string;
  seat?: string;
}

const key = (slug: string) => `frontrow_ticket_${slug}`;
const memory = new Map<string, Ticket>();

export const MAX_NAME_LENGTH = 40;

export function cleanName(raw: string): string {
  const printable = Array.from(raw).filter((ch) => {
    const c = ch.codePointAt(0) || 0;
    return c >= 0x20 && c !== 0x7f && ch !== '<' && ch !== '>';
  });
  return printable.join('').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

export function readTicket(slug: string): Ticket | null {
  try {
    const raw = window.localStorage.getItem(key(slug));
    if (raw) {
      const t = JSON.parse(raw) as Ticket;
      if (t && typeof t.name === 'string' && t.name && t.showSlug === slug) return t;
    }
  } catch {
    /* storage unavailable or corrupt: fall through to memory */
  }
  return memory.get(slug) || null;
}

function save(t: Ticket): void {
  memory.set(t.showSlug, t);
  try {
    window.localStorage.setItem(key(t.showSlug), JSON.stringify(t));
  } catch {
    /* keep the in-memory copy */
  }
  try {
    window.sessionStorage.setItem('frontrow_user_name', t.name);
  } catch {
    /* the house will ask for the name again */
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function issueTicket(slug: string, rawName: string): Ticket {
  const name = cleanName(rawName);
  if (!name) throw new Error('A ticket needs a name');
  const prev = readTicket(slug);
  const t: Ticket = {
    id: prev?.id || newId(),
    showSlug: slug,
    name,
    issuedAt: prev?.issuedAt || new Date().toISOString(),
    seat: prev?.seat,
  };
  save(t);
  return t;
}

export function setTicketSeat(slug: string, seat: string | undefined): void {
  const t = readTicket(slug);
  if (t) save({ ...t, seat });
}

export function tearUpTicket(slug: string): void {
  memory.delete(slug);
  try {
    window.localStorage.removeItem(key(slug));
  } catch {
    /* nothing kept */
  }
}
