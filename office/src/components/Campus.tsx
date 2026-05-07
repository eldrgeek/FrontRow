import type { Route } from '../hooks/useRoute';

interface Building {
  route: Exclude<Route, 'campus'>;
  label: string;
  who: string;     // who works here
  shape: 'rect' | 'long' | 'tower' | 'temple' | 'octagon' | 'round' | 'cross' | 'hex' | 'green' | 'plots' | 'amorph' | 'lot';
  x: number; y: number; w: number; h: number;
  vibe: string;
}

// Coords laid out in 4 rows with label clearance between rows.
const BUILDINGS: Building[] = [
  // Row 1 (y 4-22, labels at 24-28)
  { route: 'library',    label: 'The Library',     who: 'Mem · Rin · The Wall',  shape: 'temple',  x: 6,  y: 6,  w: 36, h: 16, vibe: 'archive' },
  { route: 'tower',      label: 'The Tower',       who: 'Dee',                    shape: 'tower',   x: 46, y: 4,  w: 7,  h: 22, vibe: 'orchestrator' },
  { route: 'studio',     label: 'The Studio',      who: 'Drew · Pax',             shape: 'long',    x: 57, y: 6,  w: 28, h: 9,  vibe: 'words' },
  { route: 'booth',      label: 'The Booth',       who: 'Sona',                   shape: 'octagon', x: 88, y: 6,  w: 10, h: 12, vibe: 'audio' },
  // Row 2 (y 32-44, labels at 46-50)
  { route: 'situation',  label: 'Situation',       who: 'Locke · Ward',           shape: 'rect',    x: 57, y: 32, w: 18, h: 10, vibe: 'security' },
  { route: 'workshop',   label: 'The Workshop',    who: 'Ren',                    shape: 'rect',    x: 78, y: 32, w: 9,  h: 10, vibe: 'pixels' },
  { route: 'forge',      label: 'The Forge',       who: 'Cog · Cal',              shape: 'hex',     x: 90, y: 32, w: 10, h: 10, vibe: 'process' },
  // Row 3 (y 56-70, labels at 72-76)
  { route: 'garden',     label: 'The Garden',      who: 'Mae',                    shape: 'plots',   x: 6,  y: 56, w: 18, h: 12, vibe: 'community' },
  { route: 'cafe',       label: 'The Cafe',        who: 'open · Bea greets',      shape: 'round',   x: 28, y: 56, w: 16, h: 12, vibe: 'pairs' },
  { route: 'forum',      label: 'The Forum',       who: 'all · rotating',         shape: 'round',   x: 47, y: 56, w: 13, h: 12, vibe: 'meetings' },
  { route: 'greenhouse', label: 'The Greenhouse',  who: 'Tilt · Kit',             shape: 'green',   x: 64, y: 56, w: 20, h: 12, vibe: 'growth' },
  { route: 'clinic',     label: 'The Clinic',      who: 'Vee',                    shape: 'cross',   x: 88, y: 56, w: 10, h: 12, vibe: 'patient flow' },
  // Row 4 (y 80-94)
  { route: 'lounge',     label: 'The Lounge',      who: 'no agenda',              shape: 'amorph',  x: 6,  y: 80, w: 28, h: 14, vibe: 'sit' },
  { route: 'lot',        label: 'The Lot',         who: 'reserved · undecorated', shape: 'lot',     x: 70, y: 80, w: 28, h: 14, vibe: 'mike, if he wants' },
];

function ShapePath({ b }: { b: Building }) {
  const { x, y, w, h, shape } = b;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const cls = `bldg bldg-${b.route} bldg-shape-${shape}`;
  switch (shape) {
    case 'rect':
    case 'long':
      return <rect className={cls} x={x} y={y} width={w} height={h} rx={0.6} />;
    case 'temple': {
      // a long building with portico steps fully inside the footprint
      return (
        <g className={cls}>
          <rect x={x} y={y} width={w} height={h} rx={0.6} />
          {/* columns inside the footprint */}
          {Array.from({ length: 7 }).map((_, i) => (
            <rect key={i} x={x + 2 + i * ((w - 4) / 6)} y={y + h - 2} width={0.6} height={1.4} className="bldg-column" />
          ))}
          {/* portico step inside */}
          <rect x={x + w * 0.35} y={y + h - 0.4} width={w * 0.3} height={0.8} className="bldg-column" />
        </g>
      );
    }
    case 'tower': {
      // tall narrow with rooftop notch
      return (
        <g className={cls}>
          <rect x={x} y={y + 2} width={w} height={h - 2} rx={0.4} />
          <polygon points={`${x},${y + 2} ${x + w},${y + 2} ${x + w / 2},${y - 0.5}`} />
          {/* windows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <rect key={i} x={x + w * 0.3} y={y + 5 + i * 4} width={w * 0.4} height={1} className="bldg-window" />
          ))}
        </g>
      );
    }
    case 'octagon': {
      const o = 2.2; // chamfer
      const pts = [
        `${x + o},${y}`, `${x + w - o},${y}`,
        `${x + w},${y + o}`, `${x + w},${y + h - o}`,
        `${x + w - o},${y + h}`, `${x + o},${y + h}`,
        `${x},${y + h - o}`, `${x},${y + o}`,
      ].join(' ');
      return <polygon className={cls} points={pts} />;
    }
    case 'round':
      return <ellipse className={cls} cx={cx} cy={cy} rx={w / 2} ry={h / 2} />;
    case 'cross': {
      const t = w * 0.36; // arm thickness
      return (
        <g className={cls}>
          <rect x={cx - t / 2} y={y} width={t} height={h} rx={0.4} />
          <rect x={x} y={cy - t / 2} width={w} height={t} rx={0.4} />
        </g>
      );
    }
    case 'hex': {
      const a = w / 2;
      const pts = [
        `${cx - a},${cy}`,
        `${cx - a / 2},${cy - h / 2}`,
        `${cx + a / 2},${cy - h / 2}`,
        `${cx + a},${cy}`,
        `${cx + a / 2},${cy + h / 2}`,
        `${cx - a / 2},${cy + h / 2}`,
      ].join(' ');
      return <polygon className={cls} points={pts} />;
    }
    case 'green': {
      // glass house with gabled roof
      return (
        <g className={cls}>
          <rect x={x} y={y + 2} width={w} height={h - 2} rx={0.3} />
          <polygon points={`${x},${y + 2} ${x + w},${y + 2} ${x + w / 2},${y - 0.3}`} />
          {/* glass strips */}
          {Array.from({ length: 5 }).map((_, i) => (
            <line key={i} x1={x + (i + 1) * (w / 6)} y1={y + 2} x2={x + (i + 1) * (w / 6)} y2={y + h} className="bldg-glass" />
          ))}
        </g>
      );
    }
    case 'plots': {
      // small plot grid
      const cols = 4, rows = 2;
      const pw = (w - 1.5) / cols;
      const ph = (h - 1.5) / rows;
      return (
        <g className={cls}>
          {Array.from({ length: rows }).flatMap((_, r) =>
            Array.from({ length: cols }).map((_, c) => (
              <rect
                key={`${r}-${c}`}
                x={x + 0.5 + c * pw + c * 0.3}
                y={y + 0.5 + r * ph + r * 0.3}
                width={pw - 0.3}
                height={ph - 0.3}
                rx={0.3}
              />
            )),
          )}
        </g>
      );
    }
    case 'amorph': {
      // soft blob
      const pts = [
        `${x + 4},${y}`,
        `${x + w - 2},${y + 1}`,
        `${x + w},${y + h * 0.4}`,
        `${x + w - 3},${y + h - 1}`,
        `${x + 5},${y + h}`,
        `${x + 1},${y + h * 0.6}`,
        `${x},${y + h * 0.3}`,
      ].join(' ');
      return <polygon className={cls} points={pts} />;
    }
    case 'lot':
      return <rect className={cls} x={x} y={y} width={w} height={h} rx={0.4} />;
  }
}

interface Props { onPick: (r: Route) => void }

export function Campus({ onPick }: Props) {
  return (
    <section className="campus">
      <header className="campus-head">
        <div className="campus-eyebrow">welcome to the campus</div>
        <h1 className="campus-title">The team's home</h1>
        <p className="campus-sub">
          Sprawl, by design. Different work wants different rooms; different rooms want different shapes.
          Click a building to walk in.
        </p>
      </header>

      <div className="campus-map-wrap">
        <svg viewBox="0 0 110 100" className="campus-map" role="img" aria-label="Campus map">
          {/* ground */}
          <rect x="0" y="0" width="110" height="100" className="campus-ground" />
          {/* paths */}
          <g className="campus-paths">
            <path d="M 24 28 L 24 56" />
            <path d="M 50 28 L 50 56" />
            <path d="M 75 46 L 75 56" />
            <path d="M 50 70 L 50 80" />
            <path d="M 6 50 L 100 50" />
            <path d="M 6 75 L 100 75" />
          </g>
          {/* buildings */}
          {BUILDINGS.map(b => (
            <g key={b.route} className="bldg-grp" onClick={() => onPick(b.route)} tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter') onPick(b.route); }}
              aria-label={b.label}>
              <ShapePath b={b} />
              <text x={b.x + b.w / 2} y={b.y + b.h + 3} textAnchor="middle" className="bldg-label">{b.label}</text>
              <text x={b.x + b.w / 2} y={b.y + b.h + 5} textAnchor="middle" className="bldg-who">{b.who}</text>
            </g>
          ))}
          {/* compass */}
          <g className="campus-compass" transform="translate(102 92)">
            <circle r="3.5" />
            <text y="0.6" textAnchor="middle" className="campus-N">N</text>
          </g>
        </svg>
      </div>

      <div className="campus-legend">
        <span><i className="lg lg-archive" /> archive</span>
        <span><i className="lg lg-orchestrator" /> orchestrator</span>
        <span><i className="lg lg-words" /> words</span>
        <span><i className="lg lg-audio" /> audio</span>
        <span><i className="lg lg-security" /> security</span>
        <span><i className="lg lg-pixels" /> pixels</span>
        <span><i className="lg lg-process" /> process</span>
        <span><i className="lg lg-pairs" /> pairs</span>
        <span><i className="lg lg-meetings" /> meetings</span>
        <span><i className="lg lg-growth" /> growth</span>
        <span><i className="lg lg-community" /> community</span>
        <span><i className="lg lg-patient" /> patient flow</span>
        <span><i className="lg lg-sit" /> sit</span>
        <span><i className="lg lg-mike" /> reserved</span>
      </div>
    </section>
  );
}
