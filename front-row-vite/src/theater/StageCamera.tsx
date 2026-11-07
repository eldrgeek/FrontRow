// A second performer camera: a phone propped on the boards.
//
// The green room (GreenRoom.tsx, StageCameraLink) makes a one-device performer
// ticket and shows this page's link as a QR code. The phone opens
// /show/<slug>/stage-camera?theater=&screen=#ticket=frt_… : no sign-in.
// A signed-in FrontRow admin can open the bare page too.
//
// The phone publishes video only, as the 'stage' track, under its own
// identity (performer-<id>-stage, server/tickets.mjs), so the main camera
// keeps the big screen and the sound. "Step onto the stage" puts this feed
// on the boards as the performer's figure (Stage.tsx).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import config from '../config';
import { useLiveKit } from '../hooks/useLiveKit';
import { livekitRoomFor, resolveScope, RoomScope } from '../lib/roomScope';
import { NoSuchShow } from './FrontOfHouse';
import { useAuth } from '../contexts/AuthContext';
import { useShow } from './routes';
import './green.css';

type Phase = 'idle' | 'starting' | 'live' | 'error';

export function StageCameraPage(): JSX.Element {
  const show = useShow();
  const scope = useMemo(() => resolveScope(), []);
  const liveKit = useLiveKit(livekitRoomFor(scope));
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  // Leave the room when the page goes (the hook's object is new each render).
  const disconnectRef = useRef(liveKit.disconnect);
  disconnectRef.current = liveKit.disconnect;
  useEffect(() => () => {
    disconnectRef.current().catch(() => undefined);
  }, []);

  const start = async (which = facing) => {
    setPhase('starting');
    setError('');
    stream?.getTracks().forEach((t) => t.stop());
    let cam: MediaStream;
    try {
      cam = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: which, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch {
      setPhase('error');
      setError("The camera didn't open. Allow camera access for this site and try again.");
      return;
    }
    setStream(cam);
    try {
      await liveKit.connectAsStageCamera(config.livekitUrl, config.tokenUrl, cam);
      setPhase('live');
    } catch {
      setPhase('error');
      setError('The theater did not let this camera in. Scan a fresh code from the green room, or sign in as the performer on this phone.');
    }
  };

  const stop = async () => {
    await liveKit.disconnect();
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setPhase('idle');
  };

  const flip = () => {
    const next = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    if (phase === 'live' || phase === 'starting') start(next);
  };

  if (!show) return <NoSuchShow />;
  return (
    <div className="fr-green fr-stagecam" data-testid="fr-stage-camera">
      <div className="hd">Stage camera · {show.artist}</div>
      <section className="pv">
        {stream ? (
          <video ref={videoRef} autoPlay playsInline muted aria-label="This camera" style={facing === 'environment' ? { transform: 'none' } : undefined} />
        ) : (
          <div className="nocam"><p>Prop this phone up where you will stand.</p></div>
        )}
        <div className="note" data-testid="fr-stage-camera-state">
          {phase === 'live' ? 'On air: "Step onto the stage" shows this camera on the boards.' : phase === 'starting' ? 'Connecting…' : 'Not sending yet.'}
          {' '}No sound is sent from this phone; your main camera carries it.
        </div>
        {error && <div className="callout soft" role="alert">{error}</div>}
        <div className="ctl">
          {phase === 'live' || phase === 'starting' ? (
            <button type="button" className="fr-g-btn" onClick={stop}>Stop this camera</button>
          ) : (
            <button type="button" className="fr-g-btn go" onClick={() => start()} data-testid="fr-stage-camera-start">Start the stage camera</button>
          )}
          <button type="button" className="fr-g-btn" onClick={flip}>{facing === 'user' ? 'Use the back camera' : 'Use the front camera'}</button>
        </div>
      </section>
    </div>
  );
}

function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

/** The page a phone opens to become the stage camera (the ticket goes in the fragment). */
function stageCameraUrl(origin: string, slug: string, scope: RoomScope, ticketCode?: string): string {
  const q = new URLSearchParams({ theater: scope.venue, screen: scope.room });
  return `${origin}/show/${slug}/stage-camera?${q}${ticketCode ? `#ticket=${ticketCode}` : ''}`;
}

interface LinkProps {
  slug: string;
  artist: string;
  scope: RoomScope;
  /** The phone's feed once it is in the room (seen through the performer's own connection). */
  stageStream: MediaStream | null;
}

/** Green room panel: a QR code that makes a phone the stage camera. */
export function StageCameraLink({ slug, artist, scope, stageStream }: LinkProps): JSX.Element {
  const { session } = useAuth();
  const accessToken = session?.access_token || null;
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stageStream;
  }, [stageStream]);

  const make = async () => {
    setBusy(true);
    setNote('');
    try {
      // A one-device performer ticket for tonight: the phone needs no sign-in,
      // and nobody else can reuse the code once the phone has claimed it.
      const now = Date.now();
      const r = await fetch('/api/ticket-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          venue: scope.venue, room: scope.room, role: 'performer', channel: 'comp',
          validFrom: new Date(now - 60_000).toISOString(), validUntil: new Date(now + 8 * 3600_000).toISOString(),
          maxDevices: 1, holders: [`${artist} · stage camera`],
        }),
      });
      const j = await r.json().catch(() => null);
      const code = j?.tickets?.[0]?.code;
      if (r.ok && code) {
        setLink(stageCameraUrl(window.location.origin, slug, scope, code));
      } else {
        // Without a ticket the phone can still sign in as the performer.
        setLink(stageCameraUrl(window.location.origin, slug, scope));
        setNote(`No ticket was made (${j?.error || r.status}), so sign in on the phone as the performer.`);
      }
    } catch {
      setLink(stageCameraUrl(window.location.origin, slug, scope));
      setNote('The ticket service could not be reached, so sign in on the phone as the performer.');
    }
    setBusy(false);
  };

  return (
    <div className="stagecam" data-testid="fr-stage-camera-link">
      <div className="sub">Stage camera</div>
      {stageStream ? (
        <div className="note"><video ref={videoRef} autoPlay playsInline muted className="stagecam-pv" aria-label="Stage camera" />Your phone is on air. &ldquo;Step onto the stage&rdquo; shows it on the boards; this camera keeps the big screen and the sound.</div>
      ) : link ? (
        <>
          <div className="qr" data-link={link} dangerouslySetInnerHTML={{ __html: qrSvg(link) }} />
          <div className="note">Scan this with the phone you will stand in front of, then tap Start. The code works on one phone, until tonight is over.</div>
          <button type="button" className="fr-g-btn" onClick={() => navigator.clipboard?.writeText(link).catch(() => undefined)}>Copy the link instead</button>
          {note && <div className="note">{note}</div>}
        </>
      ) : (
        <>
          <div className="note">Want a phone on the stage and this camera on the big screen? Make a code for the phone.</div>
          <button type="button" className="fr-g-btn" onClick={make} disabled={busy || !accessToken} data-testid="fr-stage-camera-make">
            {busy ? 'Making a code…' : 'Use my phone as the stage camera'}
          </button>
        </>
      )}
    </div>
  );
}
