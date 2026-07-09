// ─────────────────────────────────────────────────────────────────────────────
// Client half of the SOMA error pipeline v1 — reports FrontRow errors to the
// shared intake service (backend built in parallel; contract below is what
// this file targets, not what's necessarily live yet).
//
// Service contract (intake service, default http://localhost:4300):
//
//   POST /api/errors
//     body: {
//       app: string,            // 'frontrow'
//       message: string,
//       kind: 'user' | 'system',
//       route?: string,
//       action?: string,
//       buildSha?: string,
//       userId?: string,
//       stack?: string,
//       extra?: Record<string, unknown>,
//     }
//     -> 200 { ticketId?: string, status?: string }
//
// Two-kinds rule (Mike): 'user' = bad input/validation, logged for
// usability, no ticket expected. 'system' = the app/task failed to do what
// it was asked (fetch/render/uncaught) — this is what should produce a
// ticket and the "our AI team is on it" UI.
//
// This module must NEVER throw. A broken error reporter must not break the
// app it's trying to report from — every failure mode here (network error,
// bad JSON, missing service) is swallowed and reported to the console only.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

export type ErrorReportKind = 'user' | 'system';

export interface ReportErrorOptions {
  kind?: ErrorReportKind;
  action?: string;
  route?: string;
  extra?: Record<string, unknown>;
}

export interface ErrorReportResult {
  ticketId?: string;
  status?: string;
}

/** Exported so ticketLifecycle.ts's SSE watcher (useTicketLifecycle.ts) hits
 *  the same service origin as the POST that filed the ticket in the first
 *  place — one source of truth for VITE_ERROR_SERVICE_URL resolution. */
export function errorServiceUrl(): string {
  const trimmed = import.meta.env.VITE_ERROR_SERVICE_URL?.trim();
  return (trimmed || 'http://localhost:4300').replace(/\/+$/, '');
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return String((err as { message?: unknown })?.message ?? err);
  } catch {
    return 'Unknown error';
  }
}

function stackOf(err: unknown): string | undefined {
  return err instanceof Error ? err.stack : undefined;
}

/**
 * Best-effort current-user id. Uses the already-cached local session
 * (`getSession`, not `getUser`) so this never makes its own network round
 * trip on top of the error report itself. Omitted entirely if unavailable —
 * the intake contract marks userId optional for exactly this reason.
 */
async function currentUserId(): Promise<string | undefined> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id;
  } catch {
    return undefined;
  }
}

/**
 * Reports an error to the SOMA error intake service. Never throws — every
 * failure (network down, service not up yet, bad response) is swallowed and
 * logged to the console so a broken reporter can never take down the app
 * it's instrumenting.
 */
export async function reportError(
  err: unknown,
  opts: ReportErrorOptions = {},
): Promise<ErrorReportResult> {
  try {
    const userId = await currentUserId();
    const body = {
      app: 'frontrow',
      message: messageOf(err),
      kind: opts.kind ?? 'system',
      route: opts.route ?? (typeof location !== 'undefined' ? location.pathname : undefined),
      action: opts.action,
      buildSha: import.meta.env.VITE_BUILD_SHA,
      ...(userId ? { userId } : {}),
      stack: stackOf(err),
      extra: opts.extra,
    };

    const resp = await fetch(`${errorServiceUrl()}/api/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      console.error('[errorReport] intake service responded', resp.status);
      return {};
    }

    const payload = (await resp.json().catch(() => ({}))) as ErrorReportResult;
    return { ticketId: payload.ticketId, status: payload.status };
  } catch (reportErr) {
    // The reporter itself failed (service down, network blip, etc). Log and
    // move on — never let this surface to the caller as a thrown error.
    console.error('[errorReport] failed to report error', reportErr);
    return {};
  }
}

/**
 * Wires window.onerror + unhandledrejection to reportError(kind:'system').
 * Call once at app bootstrap (src/main.tsx). Covers uncaught errors outside
 * React's render tree (the React error boundary, ErrorBoundary.tsx, covers
 * render-tree "snap" errors separately).
 */
export function installGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event: ErrorEvent) => {
    void reportError(event.error ?? event.message, {
      kind: 'system',
      action: 'window.onerror',
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    void reportError(event.reason, {
      kind: 'system',
      action: 'unhandledrejection',
    });
  });
}
