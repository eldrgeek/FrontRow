// Front of house: the invitation and the ticket.
// The guest's path is /show/<slug> → /ticket → /lobby → /house.
import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Show } from './show';
import { showPath, useShowState } from './routes';
import { cleanName, issueTicket, MAX_NAME_LENGTH, readTicket, Ticket } from './ticket';
import './theater.css';

export function NoSuchShow(): JSX.Element {
  return (
    <div className="fr">
      <div className="fr-center">
        <div className="fr-eyebrow">Front Row Theater</div>
        <p style={{ fontFamily: 'var(--serif)', fontSize: 24, textAlign: 'center', maxWidth: 420 }}>
          That show isn't on the bill. Your invitation may have a typo.
        </p>
        <a className="fr-btn" href="/">See tonight's show</a>
      </div>
    </div>
  );
}

/** Wraps every page past the invitation: no ticket, back to the invitation. */
export function WithTicket({ children }: { children: (show: Show, ticket: Ticket) => React.ReactNode }): JSX.Element {
  const { show, loading } = useShowState();
  if (!show) return loading ? <div className="fr" aria-busy="true" /> : <NoSuchShow />;
  const ticket = readTicket(show.slug);
  if (!ticket) return <Navigate to={showPath(show)} replace />;
  return <>{children(show, ticket)}</>;
}

export function InvitePage(): JSX.Element {
  const { show, loading } = useShowState();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const existing = show ? readTicket(show.slug) : null;
  const [asking, setAsking] = useState(params.get('rename') === '1');
  const [name, setName] = useState(existing?.name || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (show) document.title = `${show.artist} · Front Row Theater`;
  }, [show]);
  useEffect(() => {
    if (asking) inputRef.current?.focus();
  }, [asking]);

  if (!show) return loading ? <div className="fr" aria-busy="true" /> : <NoSuchShow />;
  const closed = show.status === 'cancelled' ? 'This night was cancelled. We are sorry to miss you.'
    : show.status === 'library' ? 'This show is over. Its recording, if there is one, is in the Performance Library.'
    : null;

  const takeSeat = () => {
    if (existing) navigate(showPath(show, 'ticket'));
    else setAsking(true);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanName(name)) return;
    issueTicket(show.slug, name);
    navigate(showPath(show, 'ticket'));
  };

  return (
    <div className="fr" data-testid="fr-invite">
      <div className="fr-center">
        <div className="fr-invite">
          <div className="fr-eyebrow">You're invited</div>
          <h1>{show.artist}</h1>
          <div className="tag">{show.tagline}</div>
          <div className="when">{show.when} · {show.setLength}</div>
          {closed ? (
            <p className="fine" data-testid="fr-show-closed">{closed}</p>
          ) : !asking ? (
            <button type="button" className="fr-btn" onClick={takeSeat} data-testid="fr-take-seat">
              {existing ? `Welcome back, ${existing.name}` : 'Take your seat'}
            </button>
          ) : (
            <form onSubmit={submit}>
              <label htmlFor="fr-name">Your name, for your seat</label>
              <input
                id="fr-name"
                ref={inputRef}
                value={name}
                maxLength={MAX_NAME_LENGTH}
                autoComplete="given-name"
                placeholder="First name is fine"
                onChange={(e) => setName(e.target.value)}
                data-testid="fr-name"
              />
              <button type="submit" className="fr-btn" disabled={!cleanName(name)} data-testid="fr-get-ticket">
                Get my ticket
              </button>
              <div className="fine">No account, no download, no password. Your name stays on this device and on your seat.</div>
            </form>
          )}
          <div className="from">from {show.invitedBy}</div>
        </div>
      </div>
    </div>
  );
}

export function TicketPage(): JSX.Element {
  const navigate = useNavigate();
  return (
    <WithTicket>
      {(show, ticket) => (
        <div className="fr" data-testid="fr-ticket">
          <div className="fr-center">
            <div className="fr-ticket" role="img" aria-label={`Ticket for ${ticket.name}: ${show.artist}, live. Doors ${show.doorsOpen}.`}>
              <div className="main">
                <div className="k">Front Row Theater · Admit one</div>
                <h1>{show.artist} · Live</h1>
                <div className="row">
                  <div>Ticket holder<b data-testid="fr-ticket-name">{ticket.name}</b></div>
                  <div>Room<b>Live</b></div>
                  <div>Doors<b>{show.doorsOpen}</b></div>
                </div>
              </div>
              <div className="stub">
                <div className="k">Seat</div>
                {ticket.seat ? (
                  <div className="seat">{ticket.seat}</div>
                ) : (
                  <div className="seat unpicked">Your pick, inside</div>
                )}
                <div style={{ fontSize: 13 }}>front row</div>
              </div>
            </div>
            <div className="fr-chips" aria-hidden="true">
              <span className="fr-chip"><s>account</s></span>
              <span className="fr-chip"><s>download</s></span>
              <span className="fr-chip"><s>password</s></span>
              <span className="fr-chip">your name, your seat</span>
            </div>
            <button type="button" className="fr-btn brass" onClick={() => navigate(showPath(show, 'lobby'))} data-testid="fr-enter-lobby">
              Into the lobby
            </button>
            <button type="button" className="fr-link" onClick={() => navigate(showPath(show) + '?rename=1')}>
              Not {ticket.name}? Change the name
            </button>
          </div>
        </div>
      )}
    </WithTicket>
  );
}
