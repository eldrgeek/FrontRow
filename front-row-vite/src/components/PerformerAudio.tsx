// The performer's sound in the house.
//
// Every element that shows the performer's video (the big screen's texture,
// the stage figure) is muted, so before this the house saw the show and heard
// nothing. This plays the performer's mic once, in one <audio> element. A
// browser that blocks autoplay gets a "Tap for sound" button.
import React, { useEffect, useRef, useState } from 'react';

export function PerformerAudio({ stream }: { stream: MediaStream | null }): JSX.Element | null {
  const ref = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);
  const mic = stream?.getAudioTracks()[0] || null;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!mic) {
      el.srcObject = null;
      setBlocked(false);
      return;
    }
    el.srcObject = new MediaStream([mic]);
    el.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  }, [mic]);

  return (
    <>
      <audio ref={ref} autoPlay data-testid="performer-audio" />
      {blocked && (
        <button
          type="button"
          data-testid="performer-audio-unblock"
          onClick={() => ref.current?.play().then(() => setBlocked(false)).catch(() => undefined)}
          style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9997, padding: '10px 18px', borderRadius: 999, border: '1px solid #d9b77a', background: '#1a1410', color: '#fff4d2', font: '600 15px sans-serif', cursor: 'pointer' }}
        >
          Tap for sound
        </button>
      )}
    </>
  );
}
