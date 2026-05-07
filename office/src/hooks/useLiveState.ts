import { useEffect, useState } from 'react';

export interface LiveState {
  online: boolean;
  source: 'yeshie' | 'fallback';
  workers?: { name: string; status: string }[];
  lastUpdate?: string;
}

// Tries the Yeshie relay. Silent fallback to "off-air" if unreachable.
export function useLiveState(pollMs = 8000): LiveState {
  const [state, setState] = useState<LiveState>({ online: false, source: 'fallback' });

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('http://localhost:3333/state', { mode: 'cors' });
        if (!r.ok) throw new Error('not ok');
        const j = await r.json();
        if (alive) setState({ online: true, source: 'yeshie', workers: j.workers || [], lastUpdate: new Date().toISOString() });
      } catch {
        if (alive) setState(s => ({ ...s, online: false, source: 'fallback' }));
      }
    };
    tick();
    const id = setInterval(tick, pollMs);
    return () => { alive = false; clearInterval(id); };
  }, [pollMs]);

  return state;
}
