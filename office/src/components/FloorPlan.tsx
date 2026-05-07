import { useEffect, useState } from 'react';

const ROOMS = [
  { id: 'wall', label: 'Wall', x: 8, y: 12, w: 84, h: 14 },
  { id: 'hub', label: "Dee's Hub", x: 8, y: 30, w: 26, h: 18 },
  { id: 'desks', label: 'Desks', x: 36, y: 30, w: 38, h: 32 },
  { id: 'meeting', label: 'Meeting', x: 76, y: 30, w: 16, h: 18 },
  { id: 'coffee', label: 'Coffee', x: 8, y: 52, w: 26, h: 32 },
  { id: 'mike', label: "Mike's Desk", x: 76, y: 52, w: 16, h: 32 },
];

export function FloorPlan() {
  const [active, setActive] = useState<string>('wall');

  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: 0 },
    );
    ROOMS.forEach(r => {
      const el = document.getElementById(r.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <aside className="floorplan" aria-label="Office floor plan">
      <div className="fp-eyebrow">floor plan</div>
      <svg viewBox="0 0 100 96" className="fp-svg" role="img" aria-label="Office layout">
        <rect x="4" y="4" width="92" height="88" className="fp-outer" />
        {ROOMS.map(r => (
          <a key={r.id} href={`#${r.id}`} aria-label={r.label}>
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              className={`fp-room fp-${r.id} ${active === r.id ? 'is-active' : ''}`}
              rx={1.2}
            />
            <text
              x={r.x + r.w / 2}
              y={r.y + r.h / 2 + 1.2}
              className="fp-label"
              textAnchor="middle"
            >{r.label}</text>
          </a>
        ))}
      </svg>
    </aside>
  );
}
