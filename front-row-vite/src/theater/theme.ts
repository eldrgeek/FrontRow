// Theme tokens → CSS and three.js.
//
// A theater definition carries a palette (definition.ts ThemePalette). Five
// colors are required; the rest are optional and derived here, so a builder
// can recolor a theater by naming five colors and a saved record from before
// the extra keys still loads. The front of house reads the result as CSS
// custom properties (--t-*, mapped in theater.css); the 3D house reads the
// same values as material colors (useHouse().palette).
import { ThemePalette, ThemeTokens } from './definition';

export type HousePalette = Required<ThemePalette> & { curtain: string };

// ---------------------------------------------------------------------------
// Small color helpers (hex in, hex out). Enough for derivation; not a library.
// ---------------------------------------------------------------------------

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

/** Mix `a` toward `b` by t (0 = a, 1 = b). Non-hex input comes back unchanged. */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return a;
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

const darken = (c: string, t: number) => mix(c, '#000000', t);
const lighten = (c: string, t: number) => mix(c, '#ffffff', t);

const CURTAINS: Record<ThemeTokens['curtain'], string> = {
  'velvet-red': '#8B0000',
  'velvet-blue': '#1b2a6b',
  none: 'none',
};

/** Every token the house uses, explicit where the record says so, derived otherwise. */
export function resolvePalette(theme: ThemeTokens): HousePalette {
  const p = theme.palette;
  return {
    wall: p.wall,
    marquee: p.marquee,
    marqueeText: p.marqueeText,
    accent: p.accent,
    seat: p.seat,
    houseBlack: p.houseBlack ?? darken(p.wall, 0.55),
    wallHi: p.wallHi ?? lighten(p.wall, 0.2),
    carpet: p.carpet ?? mix(p.wall, p.seat, 0.6),
    door: p.door ?? mix(p.seat, p.wall, 0.15),
    accentLo: p.accentLo ?? darken(p.accent, 0.22),
    accentHi: p.accentHi ?? lighten(p.accent, 0.6),
    marqueeGlow: p.marqueeGlow ?? mix(p.marqueeText, p.accent, 0.4),
    playbill: p.playbill ?? '#f4ead3',
    playbillDim: p.playbillDim ?? '#c9b48a',
    seatTaken: p.seatTaken ?? darken(p.seat, 0.55),
    stageWood: p.stageWood ?? '#6b4426',
    curtain: CURTAINS[theme.curtain] ?? CURTAINS['velvet-red'],
  };
}

const CSS_KEYS: Array<[keyof HousePalette, string]> = [
  ['houseBlack', '--t-house-black'],
  ['wall', '--t-wall'],
  ['wallHi', '--t-wall-hi'],
  ['accentLo', '--t-accent-lo'],
  ['accent', '--t-accent'],
  ['accentHi', '--t-accent-hi'],
  ['marqueeText', '--t-marquee-text'],
  ['marqueeGlow', '--t-marquee-glow'],
  ['marquee', '--t-marquee'],
  ['carpet', '--t-carpet'],
  ['door', '--t-door'],
  ['playbill', '--t-playbill'],
  ['playbillDim', '--t-playbill-dim'],
];

/** The palette as CSS custom properties, for theater.css's .fr block. */
export function themeVars(p: HousePalette): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of CSS_KEYS) out[v] = p[k];
  return out;
}

/** Put the palette on <html> so every .fr page (and its portals) inherits it. */
export function applyThemeVars(p: HousePalette, el: HTMLElement = document.documentElement): () => void {
  const vars = themeVars(p);
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  return () => {
    for (const k of Object.keys(vars)) el.style.removeProperty(k);
  };
}
