// The lobby: three doors and the sound of a crowd.
// Left, Songs of the Revolution. Centre, tonight's live show. Right, the
// Performance Library. The crowd loop starts as the guest arrives (they just
// clicked, so the browser allows it); if it is refused, a Sound button waits.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Door, doorsFor, Show } from './show';
import { WithTicket } from './FrontOfHouse';
import { showPath } from './routes';
import { useAmbience } from './useAmbience';
import { Ticket } from './ticket';
import './lobby.css';

export function SoundButton({ on, toggle }: { on: boolean; toggle: () => void }): JSX.Element {
  return (
    <button type="button" className="fr-sound" onClick={toggle} aria-pressed={on} data-testid="fr-sound">
      <span aria-hidden="true">{on ? '🔊' : '🔈'}</span> {on ? 'Sound on' : 'Sound off'}
    </button>
  );
}

function Bulbs({ count }: { count: number }): JSX.Element {
  return (
    <div className="bulbs" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} style={{ animationDelay: `${(i % 6) * 0.15}s` }} />
      ))}
    </div>
  );
}

function LobbyDoor({ door, onEnter, onFocus }: { door: Door; onEnter: () => void; onFocus: () => void }): JSX.Element {
  return (
    <button
      type="button"
      className={`fr-door ${door.side}`}
      onClick={onEnter}
      onMouseEnter={onFocus}
      onFocus={onFocus}
      aria-label={`${door.title}. ${door.blurb}`}
      data-testid={`fr-door-${door.id}`}
    >
      <div className="marquee">
        <Bulbs count={door.side === 'center' ? 14 : 10} />
        {door.marquee.map((line, i) => <div key={i} className={i === 1 ? 'big' : ''}>{line}</div>)}
        <Bulbs count={door.side === 'center' ? 14 : 10} />
      </div>
      <div className="leaves" aria-hidden="true">
        <span className="leaf"><i /></span>
        <span className="leaf"><i /></span>
      </div>
    </button>
  );
}

function LobbyRoom({ show, ticket }: { show: Show; ticket: Ticket }): JSX.Element {
  const navigate = useNavigate();
  const doors = doorsFor(show);
  const [focus, setFocus] = useState<Door>(doors[1]);
  const sound = useAmbience('/audio/lobby-ambience.mp3');

  useEffect(() => {
    document.title = `Lobby · ${show.artist} · Front Row Theater`;
  }, [show]);

  const enter = (d: Door) => navigate(showPath(show, d.id === 'live' ? 'house' : d.id));

  return (
    <div className="fr fr-lobby" data-testid="fr-lobby">
      <div className="wall" />
      <div className="floor" aria-hidden="true" />
      <div className="sconces" aria-hidden="true"><span /><span /><span /><span /></div>
      <div className="posters" aria-hidden="true">
        <div className="poster left">Coffee house<br /><small>since 1961</small></div>
        <div className="poster right">{show.artist}<br /><small>{show.when}</small></div>
      </div>

      <header className="fr-lobby-head">
        <div className="fr-eyebrow">The lobby · {ticket.name}'s ticket</div>
        <SoundButton {...sound} />
      </header>

      <nav className="doors" aria-label="Doors">
        {doors.map((d) => (
          <LobbyDoor key={d.id} door={d} onEnter={() => enter(d)} onFocus={() => setFocus(d)} />
        ))}
      </nav>

      <div className="crowd" aria-hidden="true">
        {[8, 14, 21, 30, 66, 73, 81, 90].map((x, i) => (
          <span key={i} style={{ left: `${x}%`, transform: `scale(${0.75 + (i % 3) * 0.15})`, animationDelay: `${i * 0.7}s` }} />
        ))}
      </div>

      <aside className="placard" aria-live="polite" data-testid="fr-placard">
        <div className="fr-eyebrow">{focus.side === 'center' ? 'Centre door' : focus.side === 'left' ? 'Left door' : 'Right door'}</div>
        <h2>{focus.title}</h2>
        <p>{focus.blurb}</p>
        <button type="button" className="fr-btn" onClick={() => enter(focus)}>
          {focus.id === 'live' ? 'Go in' : 'Have a look'}
        </button>
      </aside>
    </div>
  );
}

export function LobbyPage(): JSX.Element {
  return <WithTicket>{(show, ticket) => <LobbyRoom show={show} ticket={ticket} />}</WithTicket>;
}
