// The house: you slip through a gap in the red curtain at the back, and the
// 3D theater (the legacy App) is behind it, already knowing your name.
import React, { useCallback, useEffect, useState } from 'react';
import { WithTicket } from './FrontOfHouse';
import App from '../App';
import './house.css';

function CurtainEntry({ onDone }: { onDone: () => void }): JSX.Element {
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(onDone, reduce ? 300 : 2600);
    return () => window.clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fr-curtain-entry" aria-hidden="true" data-testid="fr-curtain-entry">
      <div className="half left" />
      <div className="half right" />
      <div className="gap-light" />
    </div>
  );
}

export function HousePage(): JSX.Element {
  const [entered, setEntered] = useState(false);
  const done = useCallback(() => setEntered(true), []);
  return (
    <WithTicket>
      {(show, ticket) => (
        <>
          <App entry={{ name: ticket.name, showSlug: show.slug }} />
          {!entered && <CurtainEntry onDone={done} />}
        </>
      )}
    </WithTicket>
  );
}
