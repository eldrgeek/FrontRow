// ─────────────────────────────────────────────────────────────────────────────
// Ticket lifecycle watcher — client half of SOMA error pipeline v2 (live
// resolution). Wraps the SSE stream soma-errors exposes at
// GET /api/errors/:id/stream (soma-errors/src/index.js) and turns it into a
// tiny push-based state machine any panel can render:
//
//   filed   -> "Sorry, something went wrong. Our AI team is on it — we'll
//               let you know when we're back up."
//   triaged -> "We found the problem. About <eta> to fix."
//   fixed   -> "Fixed — restoring your work."
//
// This module owns ONLY the subscribe/state-machine + copy logic, no UI, no
// React. `useTicketLifecycle.ts` wraps it as a hook. Kept framework-free (a)
// so it's testable the way this repo tests renderWalkthrough.ts — inject the
// EventSource implementation rather than depend on jsdom having a real one —
// and (b) so ErrorBoundary.tsx (a class component) and any future panel can
// use it without a hook.
//
// Fail-silent contract, matching errorReport.ts: this must never throw, and
// a broken/unavailable stream must never break the app it's instrumenting.
// A stream failure just means the caller keeps showing whatever it was
// already showing (the static "on it" message) — see onStreamError below.
// ─────────────────────────────────────────────────────────────────────────────

export type TicketStatus = 'filed' | 'triaged' | 'fixed';

export interface TicketStatusEvent {
  ticketId: string;
  status: TicketStatus;
  eta: string | null;
}

export interface TicketLifecycleHandlers {
  onStatus: (event: TicketStatusEvent) => void;
  /** Called when the stream is unusable (couldn't open, or errored out).
   *  Non-fatal by contract — the caller should just keep its current/static
   *  copy. EventSource retries transient drops on its own; this fires when
   *  there's nothing more this module can do about it. */
  onStreamError?: () => void;
}

export interface WatchTicketLifecycleOptions {
  /** Base URL of the soma-errors service. Defaults to VITE_ERROR_SERVICE_URL
   *  via the caller (errorReport.ts) if not supplied — this module itself
   *  stays import.meta.env-free so it works outside Vite (e.g. a future
   *  Node-side watcher) too. */
  errorServiceUrl?: string;
  /** Injectable EventSource constructor — defaults to the global one.
   *  Lets tests drive this deterministically with a fake, same pattern
   *  pollWalkthroughJob uses `sleep`/`now` injection for. */
  EventSourceImpl?: typeof EventSource;
}

const DEFAULT_ERROR_SERVICE_URL = 'http://localhost:4300';

function resolveBaseUrl(explicit?: string): string {
  const trimmed = explicit?.trim();
  return (trimmed || DEFAULT_ERROR_SERVICE_URL).replace(/\/+$/, '');
}

/**
 * Opens an EventSource against soma-errors' per-ticket SSE stream. Calls
 * `handlers.onStatus` for the current status on connect and every
 * subsequent transition. Returns an unsubscribe function that closes the
 * connection — callers MUST call it on cleanup (component unmount, ticketId
 * change, or once the lifecycle reaches 'fixed' and there's nothing left to
 * watch).
 *
 * Never throws. If EventSource is unavailable in this environment, or the
 * connection can't be opened, calls `onStreamError` once and returns a
 * no-op unsubscribe — the caller falls back to its static copy.
 */
export function watchTicketLifecycle(
  ticketId: string,
  handlers: TicketLifecycleHandlers,
  opts: WatchTicketLifecycleOptions = {},
): () => void {
  const ESImpl =
    opts.EventSourceImpl ?? (typeof EventSource !== 'undefined' ? EventSource : undefined);

  if (!ESImpl || !ticketId) {
    handlers.onStreamError?.();
    return () => {};
  }

  let source: EventSource;
  try {
    source = new ESImpl(`${resolveBaseUrl(opts.errorServiceUrl)}/api/errors/${ticketId}/stream`);
  } catch (err) {
    console.error('[ticketLifecycle] failed to open stream', err);
    handlers.onStreamError?.();
    return () => {};
  }

  let closed = false;

  const handleMessage = (event: MessageEvent) => {
    if (closed) return;
    try {
      const payload = JSON.parse(event.data) as Partial<TicketStatusEvent>;
      if (!payload || !payload.status || !payload.ticketId) return;
      handlers.onStatus(payload as TicketStatusEvent);
    } catch (err) {
      // Malformed event body — never let this crash the app. Skip it.
      console.error('[ticketLifecycle] malformed SSE payload', err);
    }
  };

  source.addEventListener('status', handleMessage as EventListener);
  source.onerror = () => {
    // EventSource auto-reconnects transient drops on its own; nothing to do
    // here except let the caller know the live channel is currently down so
    // it can fall back if it wants to. Never rethrown.
    handlers.onStreamError?.();
  };

  return () => {
    closed = true;
    try {
      source.close();
    } catch {
      // already closed / never fully opened — nothing to clean up.
    }
  };
}

/** Human-friendly ETA rendering. The service's `eta` is a free-form string
 *  ("10 minutes", "~1 hour", ...) passed straight through when present;
 *  this only exists to give a stable, non-empty fallback when a ticket was
 *  triaged without one. */
export function describeEta(eta: string | null | undefined): string {
  const trimmed = eta?.trim();
  return trimmed ? trimmed : 'a bit';
}

export interface LifecycleCopy {
  headline: string;
  body: string;
}

/**
 * The exact human-facing copy for each lifecycle phase (Mike's language,
 * SOMA error pipeline phase 2). Single source of truth so every surface —
 * ErrorBoundary, WalkthroughExportView, any future panel — says the same
 * thing. `status: null` is the pre-stream / stream-unavailable state and
 * renders the same copy as 'filed' (the existing phase-1 static message).
 */
export function describeLifecycleCopy(
  status: TicketStatus | null,
  eta: string | null,
): LifecycleCopy {
  switch (status) {
    case 'triaged':
      return { headline: 'We found the problem.', body: `About ${describeEta(eta)} to fix.` };
    case 'fixed':
      return { headline: 'Fixed — restoring your work.', body: '' };
    case 'filed':
    default:
      return {
        headline: 'Sorry, something went wrong.',
        body: "Our AI team is on it — we'll let you know when we're back up.",
      };
  }
}
