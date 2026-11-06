// /build/:theater — the theater builder.
//
// A live preview of the theater on the left; a SOMA room docked on the right,
// where several people and their AIs talk about how the theater should work.
// Every change, from a person at the panel or an AI in the room, is one of the
// edit ops (ops.ts). A person's own panel edit applies at once. An AI's
// proposal waits on a card: Preview shows it on the theater, Approve claims it
// in the room, applies it, saves a new version and reports back; Reject says
// no. Every applied change lands in the theater's change history.
//
// Who may build and approve comes from the theater's builder grant
// (access.ts), never from who created the SOMA room. An AI's proposal is only
// ever applied to the shared record: with no stored record, or no answer from
// the database, it is held, not saved to a browser draft.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getShow } from '../theater/show';
import { fill, screensInOrder, ShowFill, TheaterDefinition, TheaterRecord } from '../theater/definition';
import {
  applyOp, ARRANGEMENTS, BASE_PALETTE_KEYS, checkOp, MAX_SEATS, MAX_TICKET_USES, MAX_TICKETS, CURTAINS, describeOp, EditOp, IssueTicketsArgs, PALETTE_KEYS, PaletteKey,
  TEMPLATES, TICKET_CHANNELS, TICKET_ROLES, TICKET_SCOPES, MAX_SCREENS,
} from './ops';
import { APP_OPS } from './opSchemas';
import { browserDraftStore, chooseBuilderStore, resetBrowserDraft, TheaterChange, TheaterStore } from './store';
import { builderTicketIssuer, IssuedTicket } from './tickets';
import { BuilderAccess, loadBuilderAccess, saveBuilderRoom } from './access';
import { attachRoom, Bridge, BridgeState, loadSomaRoomScript, RoomProposal, SomaRoomElement } from './roomBridge';
import { TheaterPreview } from './TheaterPreview';
import { resolvePalette } from '../theater/theme';
import './builder.css';

const ROOMS_BASE = (import.meta.env.VITE_SOMA_ROOMS_URL || 'https://vps.mike-wolf.com/soma-rooms').replace(/\/+$/, '');
const ROOMS_APP = import.meta.env.VITE_SOMA_ROOMS_APP || 'frontrow';
const TEST_HOOKS = import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_MODE === 'true';

type CardStatus = 'pending' | 'working' | 'applied' | 'rejected' | 'failed' | 'expired' | 'elsewhere';

interface Card {
  id: string;
  source: 'room' | 'test';
  raw: { op: unknown; args: unknown };
  op: EditOp | null;
  errors: string[];
  by: string;
  rationale?: string;
  status: CardStatus;
  note?: string;
  room?: RoomProposal;
}

function aiLabel(p: RoomProposal): string {
  const ai = p.by?.aiName || 'An AI';
  const sponsor = p.by?.sponsor?.name;
  return sponsor ? `${ai} (for ${sponsor})` : ai;
}

function cardFromRoom(p: RoomProposal): Card {
  const checked = checkOp(p.op, p.args);
  const status: CardStatus =
    p.status === 'pending' ? 'pending'
      : p.status === 'approved' ? 'elsewhere'
        : p.status === 'applied' ? 'applied'
          : p.status === 'rejected' ? 'rejected'
            : p.status === 'expired' ? 'expired' : 'failed';
  return {
    id: p.id,
    source: 'room',
    raw: { op: p.op, args: p.args },
    op: 'op' in checked ? checked.op : null,
    errors: 'errors' in checked ? checked.errors : [],
    by: aiLabel(p),
    rationale: typeof p.rationale === 'string' ? p.rationale.slice(0, 1000) : undefined,
    status,
    note: p.note,
    room: p,
  };
}

export function BuilderPage(): JSX.Element {
  const { theater = '' } = useParams();
  const { user, session, loading: authLoading } = useAuth();
  const me = user?.email || session?.user?.email || 'A builder';
  const token = session?.access_token ?? null;
  const [access, setAccess] = useState<BuilderAccess | null>(null);
  const [issued, setIssued] = useState<IssuedTicket[]>([]);
  const [store, setStore] = useState<TheaterStore>(browserDraftStore);
  const [storeChosen, setStoreChosen] = useState(false);
  const issuer = useMemo(() => builderTicketIssuer(), []);

  const [record, setRecord] = useState<TheaterRecord | null | undefined>(undefined);
  const [changes, setChanges] = useState<TheaterChange[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<BridgeState | { kind: 'load-failed'; message: string }>({ kind: 'waiting' });
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const recordRef = useRef<TheaterRecord | null>(null);
  recordRef.current = record ?? null;

  useEffect(() => {
    if (authLoading) return;
    let live = true;
    setAccess(null);
    loadBuilderAccess(theater, token).then((a) => { if (live) setAccess(a); });
    return () => { live = false; };
  }, [theater, token, authLoading]);

  useEffect(() => {
    let live = true;
    setStoreChosen(false);
    chooseBuilderStore(theater).then((s) => { if (live) { setStore(s); setStoreChosen(true); } });
    return () => { live = false; };
  }, [theater]);

  const reload = useCallback(async () => {
    const r = await store.load(theater);
    setRecord(r);
    setChanges(r ? await store.listChanges(theater) : []);
    return r;
  }, [store, theater]);

  useEffect(() => {
    if (storeChosen) reload();
  }, [reload, storeChosen]);

  useEffect(() => {
    if (record) document.title = `Build · ${record.definition.name}`;
  }, [record]);

  // ── applying ────────────────────────────────────────────────────────────
  const applyEdit = useCallback(async (edit: EditOp, by: string): Promise<{ ok: boolean; note: string }> => {
    const current = recordRef.current;
    if (!current) return { ok: false, note: 'The theater is not loaded.' };
    const r = applyOp(current.definition, edit);
    if ('errors' in r) return { ok: false, note: r.errors.join('; ') };
    if (r.tickets) {
      const res = await issuer.issue(theater, r.tickets, token);
      // The codes stay on this page; the note (which reaches the room) never carries them.
      if (res.status === 'issued') setIssued((l) => [...res.tickets, ...l]);
      return { ok: res.status === 'issued', note: `${r.changes[0]}. ${res.note}` };
    }
    const note = r.changes.join('; ');
    const saved = await store.save(theater, r.next, current.version, { by, note });
    if (!('version' in saved)) {
      await reload();
      return { ok: false, note: 'current' in saved ? 'Someone else changed the theater first. It has been reloaded; look again.' : saved.error };
    }
    await reload();
    return { ok: true, note: `Applied as version ${saved.version}: ${note}` };
  }, [issuer, reload, store, theater, token]);

  const panelEdit = useCallback(async (op: unknown, args: unknown) => {
    const checked = checkOp(op, args);
    if ('errors' in checked) { setFlash({ ok: false, text: checked.errors.join('; ') }); return; }
    const res = await applyEdit(checked.op, me);
    setFlash({ ok: res.ok, text: res.note });
  }, [applyEdit, me]);

  // ── the room ────────────────────────────────────────────────────────────
  const roomHost = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<Bridge | null>(null);

  const upsertCard = useCallback((c: Card) => {
    setCards((list) => {
      const i = list.findIndex((x) => x.id === c.id);
      if (i < 0) return [c, ...list].slice(0, 50);
      const old = list[i];
      // Our own claim shows 'approved' as 'elsewhere'; keep our 'working' until we finish.
      if (old.status === 'working' && c.status === 'elsewhere') return list;
      const copy = list.slice();
      copy[i] = c;
      return copy;
    });
    // Another page applied an edit: pick up the new version.
    if (c.status === 'applied') reload();
  }, [reload]);

  const roomId = access?.roomId ?? null;
  const mayBuild = !!access?.canBuild;
  const mayApprove = !!access?.canApprove;
  useEffect(() => {
    if (!record || !mayBuild || !roomHost.current) return;
    let el: SomaRoomElement | null = null;
    let urlTimer = 0;
    let cancelled = false;
    let savedRoom = roomId;
    loadSomaRoomScript(`${ROOMS_BASE}/soma-room.js`).then(() => {
      if (cancelled || !roomHost.current) return;
      el = document.createElement('soma-room') as SomaRoomElement;
      el.setAttribute('app', ROOMS_APP);
      el.setAttribute('server', ROOMS_BASE);
      el.setAttribute('side', 'right');
      // One builder room per theater, named on the theater record. A link that names a room wins.
      const fromUrl = new URL(location.href).searchParams.get('soma-room');
      if (!fromUrl && roomId) el.setAttribute('room', roomId);
      roomHost.current.appendChild(el);
      bridgeRef.current = attachRoom(el, APP_OPS, (p) => upsertCard(cardFromRoom(p)), setRoomState);
      // When a builder opens the theater's first room, record it on the theater.
      urlTimer = window.setInterval(() => {
        const id = new URL(location.href).searchParams.get('soma-room');
        if (id && id !== savedRoom && !roomId) {
          savedRoom = id;
          saveBuilderRoom(theater, id).then((stored) => {
            // Someone else's room was saved first: that one is the theater's builder room.
            if (stored && stored !== id) {
              setFlash({ ok: false, text: 'Another builder opened this theater’s room first. Reload to join it.' });
              setAccess((a) => (a ? { ...a, roomId: stored } : a));
            }
          });
        }
      }, 3000);
    }).catch((e) => setRoomState({ kind: 'load-failed', message: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
      window.clearInterval(urlTimer);
      bridgeRef.current?.detach();
      bridgeRef.current = null;
      el?.remove();
    };
    // Mount the room once per theater, not on every record change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theater, record === undefined || record === null, mayBuild, roomId]);

  // Test hook: put an AI-style proposal on the page without a room.
  useEffect(() => {
    if (!TEST_HOOKS) return;
    const w = window as unknown as { __FRONTROW_BUILDER__?: unknown };
    let n = 0;
    w.__FRONTROW_BUILDER__ = {
      propose(op: unknown, args: unknown, rationale?: string, aiName = 'Test AI') {
        const id = `test-${Date.now()}-${n++}`;
        const checked = checkOp(op, args);
        upsertCard({
          id, source: 'test', raw: { op, args },
          op: 'op' in checked ? checked.op : null, errors: 'errors' in checked ? checked.errors : [],
          by: aiName, rationale, status: 'pending',
        });
        return id;
      },
    };
    return () => { delete w.__FRONTROW_BUILDER__; };
  }, [upsertCard]);

  const approve = async (c: Card) => {
    if (!c.op || !mayApprove || !store.shared) return;
    const by = `${c.by}, approved by ${me}`;
    const edit = c.op;
    setCards((l) => l.map((x) => (x.id === c.id ? { ...x, status: 'working' } : x)));
    let res: { ok: boolean; note: string };
    if (c.source === 'room' && c.room && bridgeRef.current) {
      res = await bridgeRef.current.decide(c.room, () => applyEdit(edit, by));
    } else {
      res = await applyEdit(edit, by);
    }
    setPreviewId(null);
    setCards((l) => l.map((x) => (x.id === c.id ? { ...x, status: res.ok ? 'applied' : 'failed', note: res.note } : x)));
    setFlash({ ok: res.ok, text: res.note });
  };

  const reject = async (c: Card) => {
    if (!mayApprove) return;
    const note = `Not applied (${me}).`;
    if (c.source === 'room' && c.room && bridgeRef.current) {
      await bridgeRef.current.reject(c.room, note).catch((e) => setFlash({ ok: false, text: String(e?.message || e) }));
    }
    if (previewId === c.id) setPreviewId(null);
    setCards((l) => l.map((x) => (x.id === c.id ? { ...x, status: 'rejected', note } : x)));
  };

  // ── rendering ───────────────────────────────────────────────────────────
  if (authLoading || access === null) return <div className="bp bp-center">Opening the builder…</div>;
  if (!access.signedIn) {
    return (
      <div className="bp bp-center" data-testid="bp-signin">
        <p>Sign in to build a theater.</p>
        <Link to={`/login?next=${encodeURIComponent(`/build/${theater}`)}`}>Sign in</Link>
      </div>
    );
  }
  if (!access.canBuild) {
    return (
      <div className="bp bp-center" data-testid="bp-no-grant">
        <p>You don’t have a builder grant for this theater. Ask its manager for one.</p>
      </div>
    );
  }
  if (record === undefined) return <div className="bp bp-center">Opening the builder…</div>;
  if (record === null) {
    return (
      <div className="bp bp-center" data-testid="bp-missing">
        <p>There is no theater called “{theater}”.</p>
        <a href="/build/front-row">Open Front Row Theater in the builder</a>
      </div>
    );
  }

  const def = record.definition;
  const previewCard = cards.find((c) => c.id === previewId && c.op);
  let shown: TheaterDefinition = def;
  const changedScreens = new Set<string>();
  if (previewCard?.op) {
    const r = applyOp(def, previewCard.op);
    if (!('errors' in r)) {
      shown = r.next;
      for (const s of r.next.screens) {
        const old = def.screens.find((o) => o.id === s.id);
        if (!old || JSON.stringify(old) !== JSON.stringify(s)) changedScreens.add(s.id);
      }
    }
  }
  const show = getShow(def.currentShowSlug);
  const screens = screensInOrder(def);
  const sel = screens.find((s) => s.id === selected) ?? screens.find((s) => s.kind === 'live') ?? screens[0];
  const pending = cards.filter((c) => c.status === 'pending' || c.status === 'working');
  const decided = cards.filter((c) => !(c.status === 'pending' || c.status === 'working'));

  return (
    <div className="bp" data-testid="bp">
      <main className="bp-main">
        <header className="bp-head">
          <div>
            <div className="bp-eyebrow">Theater builder</div>
            <h1>{def.name}</h1>
          </div>
          <div className="bp-version" data-testid="bp-version">Version {record.version}</div>
        </header>
        <p className={`bp-store${store.shared ? ' shared' : ''}`} data-testid="bp-store">{store.label}</p>
        {flash ? (
          <p className={`bp-flash ${flash.ok ? 'ok' : 'bad'}`} role="status" data-testid="bp-flash">
            {flash.text} <button type="button" onClick={() => setFlash(null)} aria-label="Dismiss">×</button>
          </p>
        ) : null}

        {issued.length ? (
          <section className="bp-issued" aria-label="Tickets just made" data-testid="bp-issued">
            <h2>Tickets just made</h2>
            <p className="bp-muted">Each link is shown once, here only. Copy them now; nothing was sent to anyone.</p>
            <ol>
              {issued.map((t) => (
                <li key={t.id}>
                  <span>{t.holder || 'Unnamed'} · {t.role}{t.seat ? ` · ${t.seat}` : ''}</span>
                  <input readOnly value={t.link} onFocus={(e) => e.currentTarget.select()} aria-label="Ticket link" />
                </li>
              ))}
            </ol>
            <button type="button" className="bp-link" onClick={() => setIssued([])}>I have copied them</button>
          </section>
        ) : null}

        <TheaterPreview
          def={shown}
          show={show}
          selected={sel?.id ?? ''}
          onSelect={setSelected}
          changedScreens={changedScreens}
          previewing={!!previewCard}
        />

        <section className="bp-proposals" aria-label="Proposals" data-testid="bp-proposals">
          <h2>Proposals from the room</h2>
          <RoomStatus state={roomState} />
          {pending.length === 0 ? <p className="bp-muted">No proposals waiting. Ask an AI in the room to suggest a change.</p> : null}
          {pending.map((c) => (
            <ProposalCard
              key={c.id}
              c={c}
              def={def}
              previewing={previewId === c.id}
              onPreview={() => setPreviewId(previewId === c.id ? null : c.id)}
              hold={!store.shared ? 'Held: this theater has no shared record yet, or the database did not answer, so an AI’s change cannot be saved. It stays waiting in the room.' : !mayApprove ? 'Only a builder who may approve can apply this.' : null}
              mayDecide={mayApprove}
              onApprove={() => approve(c)}
              onReject={() => reject(c)}
            />
          ))}
          {decided.length ? (
            <details className="bp-decided">
              <summary>{decided.length} decided</summary>
              {decided.map((c) => (
                <div key={c.id} className={`bp-decided-row ${c.status}`} data-testid="bp-decided">
                  <b>{c.status === 'elsewhere' ? 'being applied elsewhere' : c.status}</b> {String(c.raw.op)} from {c.by}
                  {c.note ? <span> — {c.note}</span> : null}
                </div>
              ))}
            </details>
          ) : null}
        </section>

        <Panel def={def} show={show} sel={sel?.id ?? ''} onSelect={setSelected} edit={panelEdit} />

        <section className="bp-history" aria-label="Change history" data-testid="bp-history">
          <h2>Change history</h2>
          {changes.length === 0 ? <p className="bp-muted">No changes yet: this is the theater as built.</p> : null}
          <ol>
            {changes.map((ch) => (
              <li key={ch.version} data-testid="bp-change">
                <b>v{ch.version}</b> {ch.note} <span className="bp-muted">— {ch.by}, {new Date(ch.at).toLocaleString()}</span>
              </li>
            ))}
          </ol>
          {!store.shared && changes.length ? (
            <button type="button" className="bp-link" onClick={() => { resetBrowserDraft(theater); reload(); }}>
              Throw away this browser's draft
            </button>
          ) : null}
        </section>
      </main>
      <div ref={roomHost} className="bp-room-host" aria-label="Builder's SOMA room" />
    </div>
  );
}

function RoomStatus({ state }: { state: BridgeState | { kind: 'load-failed'; message: string } }): JSX.Element {
  const text =
    state.kind === 'declared' ? 'The room knows this theater’s edits; AIs in it can propose changes.'
      : state.kind === 'waiting' ? 'Join the room on the right to work on this theater with others and their AIs.'
        : state.kind === 'no-support' ? 'This SOMA Rooms build cannot carry proposals yet. You can still talk in the room and edit here.'
          : state.kind === 'not-host' ? 'Only the room’s creator can tell the room about this theater’s edits. Proposals still show here once they have.'
            : `The room could not load (${state.message}).`;
  return <p className={`bp-room-status ${state.kind}`} data-testid="bp-room-status">{text}</p>;
}

function ProposalCard({ c, def, previewing, hold, mayDecide, onPreview, onApprove, onReject }: {
  c: Card; def: TheaterDefinition; previewing: boolean; hold: string | null; mayDecide: boolean;
  onPreview: () => void; onApprove: () => void; onReject: () => void;
}): JSX.Element {
  const summary = c.op ? describeOp(def, c.op) : null;
  const blocked = !c.op || (summary?.includes('(cannot apply') ?? true);
  return (
    <article className={`bp-card${previewing ? ' previewing' : ''}`} data-testid="bp-card">
      <div className="bp-card-head"><b>{c.by}</b> proposes <code>{String(c.raw.op)}</code></div>
      {summary ? <p className="bp-card-sum">{summary}</p> : null}
      {c.errors.length ? <p className="bp-card-err">This proposal can’t be applied: {c.errors.join('; ')}</p> : null}
      {/* An AI's words: shown as text, never acted on. */}
      {c.rationale ? <blockquote className="bp-card-why">{c.rationale}</blockquote> : null}
      {hold && !blocked ? <p className="bp-card-hold" data-testid="bp-card-hold">{hold}</p> : null}
      <div className="bp-card-actions">
        <button type="button" onClick={onPreview} disabled={blocked || c.status === 'working'} data-testid="bp-card-preview">
          {previewing ? 'Stop previewing' : 'Preview'}
        </button>
        <button type="button" className="primary" onClick={onApprove} disabled={blocked || !!hold || c.status === 'working'} data-testid="bp-card-approve">
          {c.status === 'working' ? 'Applying…' : 'Approve'}
        </button>
        <button type="button" onClick={onReject} disabled={c.status === 'working' || !mayDecide} data-testid="bp-card-reject">Reject</button>
      </div>
    </article>
  );
}

// ── the settings panel: a person's own edits, through the same ops ─────────

function Panel({ def, show, sel, onSelect, edit }: {
  def: TheaterDefinition; show: ShowFill | null; sel: string; onSelect: (id: string) => void;
  edit: (op: unknown, args: unknown) => Promise<void>;
}): JSX.Element {
  const screens = screensInOrder(def);
  const s = screens.find((x) => x.id === sel);
  const ids = screens.map((x) => ({ id: x.id }));

  const move = (i: number, d: -1 | 1) => {
    const list = ids.slice();
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    edit('setScreens', { screens: list });
  };
  const addScreen = () => {
    let n = screens.length + 1;
    while (screens.some((x) => x.id === `screen-${n}`)) n++;
    edit('setScreens', { screens: [...ids, { id: `screen-${n}`, kind: 'shelf', title: `Screen ${n}` }] });
  };
  const remove = (id: string) => edit('setScreens', { screens: ids.filter((x) => x.id !== id) });

  return (
    <section className="bp-panel" aria-label="Settings" data-testid="bp-panel">
      <h2>Settings</h2>
      <div className="bp-group">
        <h3>Screens</h3>
        <ol className="bp-screens">
          {screens.map((x, i) => (
            <li key={x.id} className={x.id === sel ? 'sel' : ''}>
              <button type="button" className="bp-link" onClick={() => onSelect(x.id)}>{fill(x.title, show, x)}</button>
              <span className="bp-muted"> {x.kind}</span>
              <span className="bp-row-actions">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${x.title} left`}>←</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === screens.length - 1} aria-label={`Move ${x.title} right`}>→</button>
                <button type="button" onClick={() => remove(x.id)} disabled={x.kind === 'live' || screens.length === 1} aria-label={`Remove ${x.title}`}>Remove</button>
              </span>
            </li>
          ))}
        </ol>
        <button type="button" onClick={addScreen} disabled={screens.length >= MAX_SCREENS} data-testid="bp-add-screen">Add a screen</button>
      </div>

      {s ? <RoomForm key={`${s.id}-${JSON.stringify(s)}`} s={s} heading={fill(s.title, show, s)} edit={edit} /> : null}
      <ThemeForm key={JSON.stringify(def.theme)} def={def} edit={edit} />
      <TicketForm screens={screens.map((x) => x.id)} defaultShow={def.currentShowSlug} edit={edit} />
    </section>
  );
}

function RoomForm({ s, heading, edit }: { s: TheaterDefinition['screens'][number]; heading: string; edit: (op: unknown, args: unknown) => Promise<void> }): JSX.Element {
  const [template, setTemplate] = useState(s.template);
  const [seats, setSeats] = useState(s.seats?.count ?? 12);
  const [arrangement, setArrangement] = useState(s.seats?.arrangement ?? 'semicircle');
  const [title, setTitle] = useState(s.title);
  const [marquee, setMarquee] = useState(s.marquee.join('\n'));
  const [blurb, setBlurb] = useState(s.blurb);
  const [signage, setSignage] = useState(s.signage ?? '');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const args: Record<string, unknown> = { screen: s.id };
    if (template !== s.template) args.template = template;
    if (s.kind === 'live' && seats !== s.seats?.count) args.seats = seats;
    if (s.kind === 'live' && arrangement !== s.seats?.arrangement) args.arrangement = arrangement;
    if (title !== s.title) args.title = title;
    const lines = marquee.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.join('\n') !== s.marquee.join('\n')) args.marquee = lines;
    if (blurb !== s.blurb) args.blurb = blurb;
    if (signage !== (s.signage ?? '')) args.signage = signage;
    edit('setRoom', args);
  };
  return (
    <form className="bp-group" onSubmit={submit} data-testid="bp-room-form">
      <h3>{heading}</h3>
      <label>Room <select value={template} onChange={(e) => setTemplate(e.target.value as typeof template)} data-testid="bp-template">
        {TEMPLATES.map((t) => <option key={t}>{t}</option>)}
      </select></label>
      {s.kind === 'live' ? (
        <>
          <label>Seats <input type="number" min={1} max={MAX_SEATS} value={seats} onChange={(e) => setSeats(Number(e.target.value))} data-testid="bp-seats" /></label>
          <label>Seating <select value={arrangement} onChange={(e) => setArrangement(e.target.value as typeof arrangement)} data-testid="bp-arrangement">
            {ARRANGEMENTS.map((a) => <option key={a}>{a}</option>)}
          </select></label>
        </>
      ) : null}
      <label>Door title <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} /></label>
      <label>Marquee, one line each <textarea rows={2} value={marquee} onChange={(e) => setMarquee(e.target.value)} /></label>
      <label>Blurb <textarea rows={2} value={blurb} onChange={(e) => setBlurb(e.target.value)} maxLength={280} /></label>
      <label>Sign beside the door <input value={signage} onChange={(e) => setSignage(e.target.value)} maxLength={60} /></label>
      <button type="submit" className="primary" data-testid="bp-room-apply">Apply</button>
    </form>
  );
}

function ThemeForm({ def, edit }: { def: TheaterDefinition; edit: (op: unknown, args: unknown) => Promise<void> }): JSX.Element {
  // Colors a theme leaves out are derived (theme.ts); show what guests see.
  const shown = useMemo(() => resolvePalette(def.theme), [def.theme]);
  const [palette, setPalette] = useState<Record<PaletteKey, string>>(() => Object.fromEntries(PALETTE_KEYS.map((k) => [k, shown[k]])) as Record<PaletteKey, string>);
  const [curtain, setCurtain] = useState(def.theme.curtain);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const changed: Partial<Record<PaletteKey, string>> = {};
    for (const k of PALETTE_KEYS) if (palette[k].toLowerCase() !== shown[k].toLowerCase()) changed[k] = palette[k];
    const args: Record<string, unknown> = {};
    if (Object.keys(changed).length) args.palette = changed;
    if (curtain !== def.theme.curtain) args.curtain = curtain;
    edit('setTheme', args);
  };
  return (
    <form className="bp-group" onSubmit={submit} data-testid="bp-theme-form">
      <h3>Look</h3>
      <div className="bp-colors">
        {BASE_PALETTE_KEYS.map((k) => (
          <label key={k}>{k} <input type="color" value={palette[k]} onChange={(e) => setPalette({ ...palette, [k]: e.target.value })} data-testid={`bp-color-${k}`} /></label>
        ))}
      </div>
      <details>
        <summary className="bp-muted">More colors (derived from the five above unless set)</summary>
        <div className="bp-colors">
          {PALETTE_KEYS.filter((k) => !BASE_PALETTE_KEYS.includes(k)).map((k) => (
            <label key={k}>{k} <input type="color" value={palette[k]} onChange={(e) => setPalette({ ...palette, [k]: e.target.value })} /></label>
          ))}
        </div>
      </details>
      <label>Curtain <select value={curtain} onChange={(e) => setCurtain(e.target.value as typeof curtain)}>
        {CURTAINS.map((c) => <option key={c}>{c}</option>)}
      </select></label>
      <button type="submit" className="primary">Apply</button>
    </form>
  );
}

function TicketForm({ screens, defaultShow, edit }: { screens: string[]; defaultShow?: string; edit: (op: unknown, args: unknown) => Promise<void> }): JSX.Element {
  const [scope, setScope] = useState<IssueTicketsArgs['scope']>('venue');
  const [screen, setScreen] = useState(screens[0] ?? '');
  const [count, setCount] = useState(10);
  const [role, setRole] = useState<IssueTicketsArgs['role']>('audience');
  const [channel, setChannel] = useState<IssueTicketsArgs['channel']>('sent');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [uses, setUses] = useState(1);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const args: Record<string, unknown> = { scope, count, role, channel, uses };
    if (scope !== 'venue') args.screen = screen;
    if (scope === 'performance') args.performance = defaultShow ?? '';
    if (from) args.validFrom = new Date(from).toISOString();
    if (until) args.validUntil = new Date(until).toISOString();
    edit('issueTickets', args);
  };
  return (
    <form className="bp-group" onSubmit={submit} data-testid="bp-ticket-form">
      <h3>Tickets</h3>
      <label>For <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
        {TICKET_SCOPES.map((x) => <option key={x}>{x}</option>)}
      </select></label>
      {scope !== 'venue' ? (
        <label>Screen <select value={screen} onChange={(e) => setScreen(e.target.value)}>
          {screens.map((x) => <option key={x}>{x}</option>)}
        </select></label>
      ) : null}
      <label>How many <input type="number" min={1} max={MAX_TICKETS} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
      <label>Role <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
        {TICKET_ROLES.map((x) => <option key={x}>{x}</option>)}
      </select></label>
      <label>Given out <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
        {TICKET_CHANNELS.map((x) => <option key={x}>{x}</option>)}
      </select></label>
      <label>Uses per ticket <input type="number" min={1} max={MAX_TICKET_USES} value={uses} onChange={(e) => setUses(Number(e.target.value))} /></label>
      <label>Good from <input type="datetime-local" required value={from} onChange={(e) => setFrom(e.target.value)} data-testid="bp-ticket-from" /></label>
      <label>Until <input type="datetime-local" required value={until} onChange={(e) => setUntil(e.target.value)} data-testid="bp-ticket-until" /></label>
      <button type="submit" className="primary" data-testid="bp-tickets-issue">Issue tickets</button>
    </form>
  );
}
