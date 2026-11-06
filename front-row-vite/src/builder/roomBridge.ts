// The builder's side of the SOMA Rooms app-ops contract
// (eldrgeek/soma-rooms docs/APP-OPS.md; draft in project files
// soma-rooms-app-ops/CONTRACT.md).
//
// The page declares its ops on the room, hears proposals as
// `soma-room-proposal` events, and decides them: claim with 'approved', then
// report 'applied' or 'failed'. A first claim wins, so two open builder pages
// never both apply one edit. A proposal's rationale is an AI's words: it is
// shown as text and never acted on.

import type { AppOpDecl } from './opSchemas';

export type ProposalStatus = 'pending' | 'approved' | 'applied' | 'rejected' | 'failed' | 'expired';

export interface RoomProposal {
  id: string;
  room: string;
  op: string;
  args: unknown;
  rationale?: string;
  by: { aiName?: string; agentId?: string; sponsor?: { id?: string; name?: string } };
  status: ProposalStatus;
  createdAt: string;
  expiresAt?: string;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}

/** The parts of the <soma-room> element the builder uses. Older builds lack them. */
export interface SomaRoomElement extends HTMLElement {
  setAppOps?: (ops: AppOpDecl[]) => Promise<unknown>;
  listProposals?: () => Promise<RoomProposal[] | { proposals: RoomProposal[] }>;
  resolveProposal?: (id: string, status: 'approved' | 'applied' | 'failed' | 'rejected', note?: string) => Promise<unknown>;
}

export const PROPOSAL_EVENT = 'soma-room-proposal';

export type BridgeState =
  | { kind: 'waiting' }
  | { kind: 'no-support' }
  | { kind: 'declared' }
  | { kind: 'not-host'; message: string };

export interface Bridge {
  /** Claim, run apply, then report. Returns the note sent to the room. */
  decide(p: RoomProposal, apply: () => Promise<{ ok: boolean; note: string }>): Promise<{ ok: boolean; note: string }>;
  reject(p: RoomProposal, note: string): Promise<void>;
  detach(): void;
}

function asList(r: unknown): RoomProposal[] {
  if (Array.isArray(r)) return r as RoomProposal[];
  if (r && typeof r === 'object' && Array.isArray((r as { proposals?: unknown }).proposals)) {
    return (r as { proposals: RoomProposal[] }).proposals;
  }
  return [];
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Wire one <soma-room> element. `onProposal` gets every new or changed proposal;
 * `onState` says whether the ops are declared. Declaring needs the room's
 * creator or an app admin; a builder who is neither still sees proposals once
 * the creator's page has declared the ops.
 */
export function attachRoom(
  el: SomaRoomElement,
  ops: AppOpDecl[],
  onProposal: (p: RoomProposal) => void,
  onState: (s: BridgeState) => void,
): Bridge {
  let declared = false;
  let stopped = false;

  const onEvent = (e: Event) => {
    const p = (e as CustomEvent<{ proposal?: RoomProposal }>).detail?.proposal;
    if (p && typeof p.id === 'string') onProposal(p);
  };
  el.addEventListener(PROPOSAL_EVENT, onEvent);

  // setAppOps stores the ops on the element, which sends them itself whenever
  // it joins or reconnects. It answers null before the page has a room (no
  // network call), {skipped:'not_creator'} when this person can't declare
  // them, or the saved ops. Ask until it answers something other than null.
  const tryDeclare = async () => {
    if (stopped || declared) return;
    if (typeof el.setAppOps !== 'function') { onState({ kind: 'no-support' }); declared = true; return; }
    try {
      const r = (await el.setAppOps(ops)) as { skipped?: string } | null;
      if (r === null || r === undefined) return;
      declared = true;
      if (r.skipped) onState({ kind: 'not-host', message: r.skipped });
      else onState({ kind: 'declared' });
      const list = el.listProposals ? asList(await el.listProposals().catch(() => [])) : [];
      list.forEach(onProposal);
    } catch (e) {
      declared = true;
      onState({ kind: 'not-host', message: message(e) });
    }
  };

  // The component has no "joined" event; check every few seconds until it has a room.
  onState({ kind: 'waiting' });
  const timer = window.setInterval(tryDeclare, 3000);
  const first = window.setTimeout(tryDeclare, 500);

  return {
    async decide(p, apply) {
      if (!el.resolveProposal) return { ok: false, note: 'This room cannot take decisions yet.' };
      try {
        await el.resolveProposal(p.id, 'approved');
      } catch (e) {
        return { ok: false, note: `Could not claim it: ${message(e)}` };
      }
      let result: { ok: boolean; note: string };
      try {
        result = await apply();
      } catch (e) {
        result = { ok: false, note: message(e) };
      }
      await el.resolveProposal(p.id, result.ok ? 'applied' : 'failed', result.note.slice(0, 500)).catch(() => undefined);
      return result;
    },
    async reject(p, note) {
      await el.resolveProposal?.(p.id, 'rejected', note.slice(0, 500));
    },
    detach() {
      stopped = true;
      window.clearInterval(timer);
      window.clearTimeout(first);
      el.removeEventListener(PROPOSAL_EVENT, onEvent);
    },
  };
}

/** Load the <soma-room> script once. */
let loading: Promise<void> | null = null;
export function loadSomaRoomScript(src: string): Promise<void> {
  if (customElements.get('soma-room')) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error(`Could not load ${src}`)); };
    document.head.appendChild(s);
  });
  return loading;
}
