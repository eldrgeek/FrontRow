// What a ticket holder sees over the 3D house: the playbill line, their seat,
// and the choice to put their face on it ("if you choose, your face appears
// there too, so the people beside you know who they're sitting with").
import React, { useState } from 'react';
import CameraCapture from '../components/CameraCapture';
import { useHouse } from './useHouse';
import { Show } from './show';
import './hud.css';

interface Props {
  show: Show;
  name: string;
  seatId: string | null;
  seatedCount: number;
  hasPhoto: boolean;
  onFace: (photoDataUrl: string | null) => void;
  /** After the set the server empties the house, so the count would read 0. */
  ended?: boolean;
  /** Seats come from frontrow-server; without the socket none can be taken. */
  connected?: boolean;
  /** Live in my seat: the guest's camera on their seat cube, seen by the house. */
  live?: boolean;
  onLive?: (on: boolean) => void;
  liveError?: string;
}

export function HouseHud({ show, name, seatId, seatedCount, hasPhoto, onFace, ended, connected = true, live = false, onLive, liveError }: Props): JSX.Element {
  const { label: seatLabel, seats: houseSeats } = useHouse();
  const [capturing, setCapturing] = useState(false);
  return (
    <div className="fr-hud" data-testid="fr-hud">
      <div className="playbill">
        <div className="k">Front Row Theater · Live tonight</div>
        <div className="t">{show.artist}</div>
        <div className="s">
          {seatId ? <>Seat <b data-testid="fr-hud-seat">{seatLabel(seatId)}</b> · {name}</> : connected ? <>{name}, pick any red seat</> : <span data-testid="fr-hud-offline">{name}, the box office isn&apos;t answering yet, so seats can&apos;t be taken</span>}
          {' · '}{ended ? 'the show has ended' : `${seatedCount} of ${houseSeats.length} seated`}
        </div>
      </div>
      {!ended && <div className="face">
        {seatId && onLive && (
          live ? (
            <button type="button" className="fr-hud-btn on" onClick={() => onLive(false)} data-testid="fr-live-off">Turn my camera off</button>
          ) : (
            <button type="button" className="fr-hud-btn" onClick={() => onLive(true)} data-testid="fr-live-on">Be live in my seat</button>
          )
        )}
        {live ? null : hasPhoto ? (
          <button type="button" className="fr-hud-btn" onClick={() => onFace(null)} data-testid="fr-face-off">Just my name</button>
        ) : (
          <button type="button" className="fr-hud-btn" onClick={() => setCapturing(true)} data-testid="fr-face-on">Put my face on my seat</button>
        )}
        {liveError && <div className="err" role="alert">{liveError}</div>}
      </div>}
      {capturing && (
        <div className="fr-hud-modal" role="dialog" aria-label="Take a photo for your seat">
          <CameraCapture
            mode="photo"
            onPhotoCapture={(img) => { setCapturing(false); onFace(img); }}
            onCancel={() => setCapturing(false)}
          />
        </div>
      )}
    </div>
  );
}
