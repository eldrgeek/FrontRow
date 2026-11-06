// A looping ambience track (the lobby crowd) that fades in and out, remembers
// the guest's sound preference, and copes with browsers refusing autoplay.
import { useEffect, useRef, useState } from 'react';

const SOUND_PREF = 'frontrow_lobby_sound';

function readSoundPref(): boolean {
  try {
    return window.localStorage.getItem(SOUND_PREF) !== 'off';
  } catch {
    return true;
  }
}
function writeSoundPref(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_PREF, on ? 'on' : 'off');
  } catch {
    /* preference not kept */
  }
}

/** A looping ambience track that fades in, and fades out on unmount. */
export function useAmbience(src: string, volume = 0.55) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [wanted, setWanted] = useState(readSoundPref);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const a = new Audio(src);
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0;
    audioRef.current = a;
    a.addEventListener('playing', () => setPlaying(true));
    a.addEventListener('pause', () => setPlaying(false));
    return () => {
      a.pause();
      a.src = '';
      audioRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    let raf = 0;
    const fadeTo = (target: number, done?: () => void) => {
      cancelAnimationFrame(raf);
      const step = () => {
        const v = a.volume + (target - a.volume) * 0.08;
        a.volume = Math.abs(target - v) < 0.01 ? target : v;
        if (a.volume !== target) raf = requestAnimationFrame(step);
        else done?.();
      };
      raf = requestAnimationFrame(step);
    };
    if (wanted) {
      a.play().then(() => fadeTo(volume)).catch(() => setPlaying(false));
    } else {
      fadeTo(0, () => a.pause());
    }
    return () => cancelAnimationFrame(raf);
  }, [wanted, volume, src]);

  const toggle = () => {
    const a = audioRef.current;
    if (wanted && playing) {
      writeSoundPref(false);
      setWanted(false);
      return;
    }
    writeSoundPref(true);
    // This click is a user gesture, so play() is allowed even if autoplay was refused.
    a?.play().then(() => { if (a.volume < 0.05) a.volume = volume; }).catch(() => undefined);
    setWanted(true);
  };

  return { on: wanted && playing, toggle };
}
