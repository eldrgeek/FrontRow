// The hallway: screens past the lobby's five, doors on both walls.
// Walking down the page is walking down the hall; each door keeps its marquee
// and its sign, and the placard at the bottom says what is behind the one you
// are looking at.
import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Show } from './show';
import { WithTicket } from './FrontOfHouse';
import { showPath } from './routes';
import { DoorSlot, doorPath, doorWords, layoutDoors } from './doorLayout';
import { HouseProvider } from './houseContext';
import { useCurrentTheater } from './blueprints';
import { LobbyDoor, Placard } from './Lobby';
import './lobby.css';
import './hallway.css';

function HallwayRoom({ show }: { show: Show }): JSX.Element {
  const navigate = useNavigate();
  const theater = useCurrentTheater();
  const { hallway } = useMemo(() => layoutDoors(theater.screens), [theater]);
  const [focus, setFocus] = useState<DoorSlot | undefined>(hallway[0]);

  useEffect(() => {
    document.title = `Hallway · ${theater.name}`;
  }, [theater]);

  if (hallway.length === 0) return <Navigate to={showPath(show, 'lobby')} replace />;

  const enter = (slot: DoorSlot) => navigate(doorPath(show, slot.screen));

  return (
    <HouseProvider definition={theater}>
      <div className="fr fr-hallway" data-testid="fr-hallway">
        <header className="fr-hallway-head">
          <button type="button" className="fr-link" onClick={() => navigate(showPath(show, 'lobby'))}>← Back to the lobby</button>
          <div className="fr-eyebrow">The hallway · {hallway.length} more screens</div>
        </header>
        <div className="corridor">
          <div className="runner" aria-hidden="true" />
          {hallway.map((slot) => (
            <div key={slot.screen.id} className={`bay ${slot.wall}`}>
              <LobbyDoor slot={slot} words={doorWords(show, slot.screen)} onEnter={() => enter(slot)} onFocus={() => setFocus(slot)} />
            </div>
          ))}
          <div className="end-wall" aria-hidden="true">Exit</div>
        </div>
        {focus && <Placard slot={focus} words={doorWords(show, focus.screen)} onEnter={() => enter(focus)} />}
      </div>
    </HouseProvider>
  );
}

export function HallwayPage(): JSX.Element {
  return <WithTicket>{(show) => <HallwayRoom show={show} />}</WithTicket>;
}
