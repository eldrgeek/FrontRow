// ─────────────────────────────────────────────────────────────────────────────
// useTicketLifecycle — React hook wrapping ticketLifecycle.ts's SSE watcher.
// Subscribes whenever `ticketId` is non-null, unsubscribes on unmount or when
// `ticketId` changes/clears. Fires `onFixed` exactly once per ticket, right
// when a 'fixed' status event arrives, then closes the stream — a lifecycle
// that reached 'fixed' has nothing left to watch.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import {
  describeLifecycleCopy,
  watchTicketLifecycle,
  type LifecycleCopy,
  type TicketStatus,
  type TicketStatusEvent,
  type WatchTicketLifecycleOptions,
} from './ticketLifecycle';

export interface TicketLifecycleState {
  status: TicketStatus | null;
  eta: string | null;
  copy: LifecycleCopy;
}

const IDLE_STATE: TicketLifecycleState = {
  status: null,
  eta: null,
  copy: describeLifecycleCopy(null, null),
};

/**
 * Watches a ticket's live status while `ticketId` is set. `onFixed` (if
 * given) fires once, the moment the ticket flips to 'fixed' — callers use
 * it to auto-retry whatever action produced the ticket (see
 * WalkthroughExportView's render() retry). The stream closes right after.
 *
 * Fail-silent: if the stream can't open or drops for good, state just stays
 * at whatever it last was (optimistically 'filed' the moment a ticketId
 * shows up, matching the static phase-1 copy) — never surfaced as an error.
 */
export function useTicketLifecycle(
  ticketId: string | null,
  onFixed?: (event: TicketStatusEvent) => void,
  opts: WatchTicketLifecycleOptions = {},
): TicketLifecycleState {
  const [state, setState] = useState<TicketLifecycleState>(IDLE_STATE);
  const onFixedRef = useRef(onFixed);
  onFixedRef.current = onFixed;
  // opts (errorServiceUrl / EventSourceImpl) is effectively static per
  // caller — read via a ref rather than added to the effect's dep array so
  // callers can pass an inline object literal without retriggering the
  // subscribe/unsubscribe cycle on every render.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!ticketId) {
      setState(IDLE_STATE);
      return;
    }
    // Optimistic 'filed' the instant we have a ticketId — this is exactly
    // the phase-1 static copy, shown immediately rather than waiting on the
    // stream's first event (which, on a healthy connection, arrives a beat
    // later and just confirms the same status).
    setState({ status: 'filed', eta: null, copy: describeLifecycleCopy('filed', null) });

    let unsubscribe: () => void = () => {};
    unsubscribe = watchTicketLifecycle(
      ticketId,
      {
        onStatus: (event) => {
          setState({ status: event.status, eta: event.eta, copy: describeLifecycleCopy(event.status, event.eta) });
          if (event.status === 'fixed') {
            onFixedRef.current?.(event);
            unsubscribe(); // one-shot: lifecycle complete, nothing left to watch
          }
        },
        onStreamError: () => {
          // Fail-silent: leave state as-is (the last known status, or the
          // optimistic 'filed' if nothing arrived yet).
        },
      },
      optsRef.current,
    );
    return () => unsubscribe();
  }, [ticketId]);

  return state;
}
