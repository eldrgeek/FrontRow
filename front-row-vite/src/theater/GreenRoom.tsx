// The green room: what only the performer sees before the show.
// A camera and mic check, a countdown with a stage manager's calls, a glimpse
// of the house filling up, and Places. When the countdown ends the existing
// performer pipeline takes the show live (App.tsx 'countdown-finished').
import React, { useEffect, useRef, useState } from 'react';
import { seatLabel } from '../lib/seatLayout';
import { Show } from './show';
import './green.css';

interface Seated { name?: string; imageUrl?: string | null }

interface Props {
  show: Show;
  stream: MediaStream | null;
  countdownTime: number;
  isCountdownActive: boolean;
  audienceSeats: Record<string, Seated | null | undefined>;
  onStartCountdown: (seconds: number) => void;
  onStopCountdown: () => void;
  /** onStage: stand on the stage as a figure instead of filling the big screen. */
  onGoLive: (onStage: boolean) => void;
  onStartCamera: () => void;
}

function useMicLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) return;
    let ctx: AudioContext | null = null;
    let raf = 0;
    try {
      ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += ((buf[i] - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* no meter, the show still runs */
    }
    return () => {
      cancelAnimationFrame(raf);
      ctx?.close().catch(() => undefined);
    };
  }, [stream]);
  return level;
}

const CALLS: Record<number, string> = {
  600: 'Ten minutes, please.',
  300: 'Five minutes.',
  60: 'One minute.',
  15: 'Places, please.',
};

function say(text: string): void {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch {
    /* no voice available: the call still shows on screen */
  }
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;
}

export function GreenRoom(p: Props): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const level = useMicLevel(p.stream);
  const [call, setCall] = useState<string>('');
  const seated = Object.entries(p.audienceSeats).filter(([, u]) => u && u.name) as [string, Seated][];

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = p.stream;
  }, [p.stream]);

  useEffect(() => {
    if (!p.isCountdownActive) return;
    const line = CALLS[p.countdownTime];
    if (line) {
      setCall(line);
      say(line);
    }
  }, [p.countdownTime, p.isCountdownActive]);

  const places = p.isCountdownActive && p.countdownTime <= 15;

  return (
    <div className="fr-green" data-testid="fr-green-room">
      <div className="hd">Green room · only {p.show.artist} can see this</div>
      <div className="cols">
        <section className="pv">
          {p.stream ? (
            <video ref={videoRef} autoPlay playsInline muted aria-label="Your camera" />
          ) : (
            <div className="nocam">
              <p>Your camera and mic are off.</p>
              <button type="button" className="fr-g-btn" onClick={p.onStartCamera} data-testid="fr-green-camera">Check my camera and mic</button>
            </div>
          )}
          <div className="meter" aria-label="Microphone level"><div style={{ width: `${Math.round(level * 100)}%` }} /></div>
          <div className="note">{p.stream ? 'Mic and camera ready' : 'Not checked yet'} · House is {seated.length ? 'filling' : 'empty so far'}</div>
          <div className="note phone">
            Performing from your phone? Open <b>{location.host}{location.pathname}</b> on it, sign in, and prop it up where you'll stand.
            &ldquo;Step onto the stage&rdquo; puts you on the boards as a figure; &ldquo;big screen&rdquo; fills the screen behind the stage.
          </div>
        </section>
        <section className="live">
          <div className="sub">{p.isCountdownActive ? "You're live in" : 'Countdown'}</div>
          <div className={`cd ${places ? 'places' : ''}`} data-testid="fr-green-countdown">
            {p.isCountdownActive ? fmt(p.countdownTime) : '—:—'}
          </div>
          <div className="sub">House: {seated.length} of {p.show.seats} seated</div>
          {places && <div className="callout" data-testid="fr-places">PLACES, PLEASE</div>}
          {!places && call && <div className="callout soft">{call}</div>}
          <div className="ctl">
            {!p.isCountdownActive ? (
              <>
                <button type="button" className="fr-g-btn" onClick={() => p.onStartCountdown(600)} data-testid="fr-green-start10">Start 10-minute countdown</button>
                <button type="button" className="fr-g-btn" onClick={() => p.onStartCountdown(120)}>2 minutes</button>
              </>
            ) : (
              <button type="button" className="fr-g-btn" onClick={p.onStopCountdown}>Hold the countdown</button>
            )}
            <button type="button" className="fr-g-btn go" onClick={() => p.onGoLive(true)} data-testid="fr-green-onstage">Step onto the stage</button>
            <button type="button" className="fr-g-btn go" onClick={() => p.onGoLive(false)} data-testid="fr-green-golive">Go on, big screen</button>
          </div>
          <div className="grid" aria-label="Who is in the house">
            {seated.map(([seatId, u]) => (
              <figure key={seatId}>
                {u.imageUrl ? <img src={u.imageUrl} alt="" /> : <div className="blank" />}
                <figcaption>{u.name}<small>{seatLabel(seatId)}</small></figcaption>
              </figure>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
