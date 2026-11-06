// The lobby: the theater's doors and the sound of a crowd.
// The doors come from the theater definition's screens, laid out by
// doorLayout.ts: up to three in a row (Front Row: Songs of the Revolution,
// tonight's live show, the Performance Library), four or five on an arc, and
// any more down the hallway. The crowd loop starts as the guest arrives (they
// just clicked, so the browser allows it); if it is refused, a Sound button waits.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Show } from './show';
import { WithTicket } from './FrontOfHouse';
import { showPath } from './routes';
import { useAmbience } from './useAmbience';
import { Ticket } from './ticket';
import { DoorSlot, DoorWords, doorPath, doorWords, layoutDoors } from './doorLayout';
import { HouseProvider } from './houseContext';
import { useCurrentTheater } from './blueprints';
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

export function LobbyDoor({ slot, words, onEnter, onFocus }: {
  slot: DoorSlot;
  words: DoorWords;
  onEnter: () => void;
  onFocus: () => void;
}): JSX.Element {
  const style = slot.turn || slot.scale !== 1
    ? ({ ['--door-tf' as string]: `perspective(900px) rotateY(${slot.turn}deg) scale(${slot.scale})` } as React.CSSProperties)
    : undefined;
  const bulbs = slot.compact ? (slot.featured ? 9 : 6) : slot.featured ? 14 : 10;
  return (
    <button
      type="button"
      className={`fr-door${slot.featured ? ' center' : ''}${slot.wall ? ` wall-${slot.wall}` : ''}`}
      style={style}
      onClick={onEnter}
      onMouseEnter={onFocus}
      onFocus={onFocus}
      aria-label={`${words.title}. ${words.blurb}`}
      data-testid={`fr-door-${slot.screen.id}`}
    >
      <div className="marquee">
        <Bulbs count={bulbs} />
        {words.marquee.map((line, i) => <div key={i} className={i === 1 ? 'big' : ''}>{line}</div>)}
        <Bulbs count={bulbs} />
      </div>
      <div className="leaves" aria-hidden="true">
        <span className="leaf"><i /></span>
        <span className="leaf"><i /></span>
      </div>
      {slot.screen.signage && <div className="signage">{slot.screen.signage}</div>}
    </button>
  );
}

export function Placard({ slot, words, onEnter }: { slot: DoorSlot; words: DoorWords; onEnter: () => void }): JSX.Element {
  return (
    <aside className="placard" aria-live="polite" data-testid="fr-placard">
      <div className="fr-eyebrow">{slot.place}</div>
      <h2>{words.title}</h2>
      <p>{words.blurb}</p>
      <button type="button" className="fr-btn" onClick={onEnter}>
        {slot.screen.kind === 'live' ? 'Go in' : 'Have a look'}
      </button>
    </aside>
  );
}

function LobbyRoom({ show, ticket }: { show: Show; ticket: Ticket }): JSX.Element {
  const navigate = useNavigate();
  const theater = useCurrentTheater();
  const layout = useMemo(() => layoutDoors(theater.screens), [theater]);
  const words = (slot: DoorSlot) => doorWords(show, slot.screen);
  const first = layout.lobby.find((d) => d.featured) || layout.lobby[0];
  const [focus, setFocus] = useState<DoorSlot>(first);
  const sound = useAmbience('/audio/lobby-ambience.mp3');

  useEffect(() => {
    document.title = `Lobby · ${show.artist} · ${theater.name}`;
  }, [show, theater]);

  const enter = (slot: DoorSlot) => navigate(doorPath(show, slot.screen));

  return (
    <HouseProvider definition={theater}>
      <div className={`fr fr-lobby mode-${layout.mode}`} data-testid="fr-lobby" data-layout={layout.mode}>
        <div className="wall" />
        <div className="floor" aria-hidden="true" />
        <div className="sconces" aria-hidden="true"><span /><span /><span /><span /></div>
        <div className="posters" aria-hidden="true">
          <div className="poster left">Coffee house<br /><small>since 1961</small></div>
          {layout.mode !== 'hallway' && <div className="poster right">{show.artist}<br /><small>{show.when}</small></div>}
        </div>

        <header className="fr-lobby-head">
          <div className="fr-eyebrow">The lobby · {ticket.name}&apos;s ticket</div>
          <SoundButton {...sound} />
        </header>

        <nav className="doors" aria-label="Doors" style={{ ['--n' as string]: layout.lobby.length }}>
          {layout.lobby.map((slot) => (
            <LobbyDoor key={slot.screen.id} slot={slot} words={words(slot)} onEnter={() => enter(slot)} onFocus={() => setFocus(slot)} />
          ))}
        </nav>

        {layout.hallway.length > 0 && (
          <button
            type="button"
            className="fr-hallway-sign"
            onClick={() => navigate(showPath(show, 'hallway'))}
            data-testid="fr-hallway-sign"
          >
            <span className="arrow" aria-hidden="true">→</span>
            <span>More screens down the hallway</span>
            <small>{layout.hallway.length} more</small>
          </button>
        )}

        <div className="crowd" aria-hidden="true">
          {[8, 14, 21, 30, 66, 73, 81, 90].map((x, i) => (
            <span key={i} style={{ left: `${x}%`, transform: `scale(${0.75 + (i % 3) * 0.15})`, animationDelay: `${i * 0.7}s` }} />
          ))}
        </div>

        <Placard slot={focus} words={words(focus)} onEnter={() => enter(focus)} />
      </div>
    </HouseProvider>
  );
}

export function LobbyPage(): JSX.Element {
  return <WithTicket>{(show, ticket) => <LobbyRoom show={show} ticket={ticket} />}</WithTicket>;
}
