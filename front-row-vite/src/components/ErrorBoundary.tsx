// ─────────────────────────────────────────────────────────────────────────────
// App-root React error boundary (SOMA error pipeline) — any uncaught render-
// tree error files a ticket with the SOMA error intake service AND shows a
// reassuring fallback instead of a white screen / raw stack trace.
//
// Ported from Playmaker's ErrorBoundary. Wraps the whole app in index.tsx,
// ABOVE the router. window.onerror / unhandledrejection (outside the render
// tree) are covered separately by installGlobalErrorHandlers() in
// errorReport.ts — this boundary only catches render/lifecycle errors React
// itself intercepts. FrontRow's existing CanvasErrorBoundary (3D-only) is a
// separate, narrower boundary and stays where it is.
//
// Live resolution (phase 2): once a ticket is filed, TicketLifecyclePanel
// watches it over SSE and drives the copy through filed -> triaged -> fixed.
// A crashed render tree has no in-progress action to auto-retry, so 'fixed'
// here does NOT auto-reload — Reload stays a manual action.
//
// NOTE: the soma-errors service has no prod origin yet (VITE_ERROR_SERVICE_URL
// defaults to localhost:4300), so ticket filing is INERT in production until
// that service is deployed — by contract this fails soft and just shows the
// static "on it" copy. Same as Playmaker.
// ─────────────────────────────────────────────────────────────────────────────
import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import { errorServiceUrl, reportError } from '../lib/errorReport';
import { useTicketLifecycle } from '../lib/useTicketLifecycle';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  ticketId?: string;
}

const WRAP_STYLE: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  minHeight: '100vh',
  padding: '0 24px',
  textAlign: 'center',
  background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
  color: '#fff',
};

const HEADLINE_STYLE: CSSProperties = {
  fontSize: '1.4rem',
  fontWeight: 600,
  color: '#d4af37',
  margin: 0,
};

const BODY_STYLE: CSSProperties = { marginTop: 8, fontSize: '0.95rem', color: '#c9c9d4' };
const REF_STYLE: CSSProperties = { marginTop: 8, fontSize: '0.75rem', color: '#8a8a99' };

const BUTTON_STYLE: CSSProperties = {
  marginTop: 16,
  background: '#d4af37',
  color: '#1a1a2e',
  border: 'none',
  borderRadius: 8,
  padding: '10px 18px',
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
};

/** Function component so it can use the useTicketLifecycle hook — the boundary
 *  itself must stay a class component (getDerivedStateFromError /
 *  componentDidCatch have no hook equivalent), so the live-copy bit is split
 *  out here and rendered from ErrorBoundary.render() below. */
function TicketLifecyclePanel({ ticketId }: { ticketId?: string }) {
  const lifecycle = useTicketLifecycle(ticketId ?? null, undefined, {
    errorServiceUrl: errorServiceUrl(),
  });
  return (
    <>
      <h1 style={HEADLINE_STYLE}>{lifecycle.copy.headline}</h1>
      {lifecycle.copy.body ? <p style={BODY_STYLE}>{lifecycle.copy.body}</p> : null}
      {ticketId ? <p style={REF_STYLE}>Ticket ref: {ticketId}</p> : null}
    </>
  );
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void reportError(error, {
      kind: 'system',
      action: 'react-error-boundary',
      extra: { componentStack: info.componentStack },
    }).then(({ ticketId }) => {
      if (ticketId) this.setState({ ticketId });
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={WRAP_STYLE}>
          <div style={{ maxWidth: 420 }}>
            <TicketLifecyclePanel ticketId={this.state.ticketId} />
            <button type="button" onClick={this.handleReload} style={BUTTON_STYLE}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
