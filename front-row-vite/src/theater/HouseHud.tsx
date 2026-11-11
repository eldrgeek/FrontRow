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
  /** House chat, open to the whole room at any time. */
  onChat?: () => void;
  chatUnread?: number;
  chatOpen?: boolean;
}

const CAMERA_CONSENT_KEY = 'frontrow_camera_consent_v1';
function hasCameraConsent(): boolean {
  try { return window.localStorage.getItem(CAMERA_CONSENT_KEY) === 'yes'; } catch { return false; }
}
function rememberCameraConsent(): void {
  try { window.localStorage.setItem(CAMERA_CONSENT_KEY, 'yes'); } catch { /* ask again next time */ }
}

export function HouseHud({ show, name, seatId, seatedCount, hasPhoto, onFace, ended, connected = true, live = false, onLive, liveError, onChat, chatUnread = 0, chatOpen = false }: Props): JSX.Element {
  const { label: seatLabel, seats: houseSeats } = useHouse();
  const [capturing, setCapturing] = useState(false);
  const [askingCamera, setAskingCamera] = useState(false);
  const goLive = () => {
    if (hasCameraConsent()) onLive?.(true);
    else setAskingCamera(true);
  };
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
            <button type="button" className="fr-hud-btn" onClick={goLive} data-testid="fr-live-on">Be live in my seat</button>
          )
        )}
        {live ? null : hasPhoto ? (
          <button type="button" className="fr-hud-btn" onClick={() => onFace(null)} data-testid="fr-face-off">Just my name</button>
        ) : (
          <button type="button" className="fr-hud-btn" onClick={() => setCapturing(true)} data-testid="fr-face-on">Put my face on my seat</button>
        )}
        {liveError && <div className="err" role="alert">{liveError}</div>}
      </div>}
      {onChat && !ended && !chatOpen && (
        <button type="button" className="fr-hud-btn fr-hud-chat" onClick={onChat} data-testid="fr-chat-open">
          House chat{chatUnread > 0 && <span className="n" data-testid="fr-chat-unread">{chatUnread}</span>}
        </button>
      )}
      {askingCamera && (
        <div className="fr-hud-modal" role="dialog" aria-label="Before your camera goes on" data-testid="fr-camera-consent">
          <div className="fr-consent">
            <h2>Before your camera goes on</h2>
            <p>Everyone in the house, and the performer on stage, will see your camera on your seat for as long as it is on.</p>
            <p>Front Row does not record seats. Anyone watching could still capture their own screen, and a show may be recorded for the Library.</p>
            <p>You can turn it off at any time with &ldquo;Turn my camera off&rdquo;.</p>
            <div className="row">
              <button type="button" className="fr-hud-btn" onClick={() => setAskingCamera(false)} data-testid="fr-camera-consent-no">Not now</button>
              <button type="button" className="fr-hud-btn on-go" onClick={() => { rememberCameraConsent(); setAskingCamera(false); onLive?.(true); }} data-testid="fr-camera-consent-yes">Turn my camera on</button>
            </div>
          </div>
        </div>
      )}
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
