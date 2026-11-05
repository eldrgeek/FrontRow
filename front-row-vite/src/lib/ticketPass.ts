// The guest's ticket code and this device's id, sent with every LiveKit token
// request (server/tickets.mjs decides what they open).
//
// A ticket link is https://<site>/#ticket=frt_… : a fragment, so the code never
// reaches a server log or a Referer. On load the code moves into localStorage
// and the fragment is removed from the address bar. The device id is random,
// made once per browser; the server binds a ticket to the first devices that
// claim it, so a forwarded link stops working once its uses are spent.
//
// Storage can throw (private windows, blocked site data). Then the code and
// device id live in memory for this page only.

import { supabase } from './supabase';

const TICKET_KEY = 'frontrow_ticket_code';
const DEVICE_KEY = 'frontrow_device_id';
const CODE = /^frt_[A-Za-z0-9_-]{24}$/;
const memory: Record<string, string> = {};

function read(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    if (v) return v;
  } catch {
    /* fall through to memory */
  }
  return memory[key] || null;
}

function write(key: string, value: string | null): void {
  if (value) memory[key] = value;
  else delete memory[key];
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* memory copy only */
  }
}

/** Take a #ticket=… code out of the address bar, once, at start-up. */
export function captureTicketFromUrl(): void {
  if (typeof window === 'undefined') return;
  const m = /(?:^#|&)ticket=([^&]+)/.exec(window.location.hash);
  if (!m) return;
  const code = decodeURIComponent(m[1]);
  if (CODE.test(code)) write(TICKET_KEY, code);
  const rest = window.location.hash.replace(/(^#|&)ticket=[^&]+/, '$1').replace(/^#&?$/, '');
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search + (rest && rest !== '#' ? rest : ''));
  } catch {
    /* the code stays visible in this tab; it still works */
  }
}

export function getTicketCode(): string | null {
  const c = read(TICKET_KEY);
  return c && CODE.test(c) ? c : null;
}

export function forgetTicket(): void {
  write(TICKET_KEY, null);
}

export function getDeviceId(): string {
  let id = read(DEVICE_KEY);
  if (!id) {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    id = btoa(String.fromCharCode(...Array.from(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    write(DEVICE_KEY, id);
  }
  return id;
}

/** Headers for a token request: the ticket (if any), the device, and the sign-in (if any). */
export async function tokenRequestHeaders(withTicket = true): Promise<Record<string, string>> {
  const h: Record<string, string> = {};
  const code = withTicket ? getTicketCode() : null;
  if (code) {
    h['X-Frontrow-Ticket'] = code;
    h['X-Frontrow-Device'] = getDeviceId();
  }
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) h.Authorization = `Bearer ${token}`;
  } catch {
    /* not signed in */
  }
  return h;
}

captureTicketFromUrl();
