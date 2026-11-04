// What a ticket holder sees over the 3D house: the playbill line, their seat,
// and the choice to put their face on it ("if you choose, your face appears
// there too, so the people beside you know who they're sitting with").
import React, { useState } from 'react';
import CameraCapture from '../components/CameraCapture';
import { seatLabel } from '../lib/seatLayout';
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
}

export function HouseHud({ show, name, seatId, seatedCount, hasPhoto, onFace, ended }: Props): JSX.Element {
  const [capturing, setCapturing] = useState(false);
  return (
    <div className="fr-hud" data-testid="fr-hud">
      <div className="playbill">
        <div className="k">Front Row Theater · Live tonight</div>
        <div className="t">{show.artist}</div>
        <div className="s">
          {seatId ? <>Seat <b data-testid="fr-hud-seat">{seatLabel(seatId)}</b> · {name}</> : <>{name}, pick any red seat</>}
          {' · '}{ended ? 'the show has ended' : `${seatedCount} of ${show.seats} seated`}
        </div>
      </div>
      {!ended && <div className="face">
        {hasPhoto ? (
          <button type="button" className="fr-hud-btn" onClick={() => onFace(null)} data-testid="fr-face-off">Just my name</button>
        ) : (
          <button type="button" className="fr-hud-btn" onClick={() => setCapturing(true)} data-testid="fr-face-on">Put my face on my seat</button>
        )}
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
