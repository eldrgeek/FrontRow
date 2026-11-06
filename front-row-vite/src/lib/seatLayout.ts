// The house's seats, in one place. SeatSelection draws them, CameraController
// flies to them and UserView looks out from them, so all three must agree.
//
// A screen in the theater definition (theater/definition.ts) names a template
// and a seat layout { count, arrangement? }. This file turns that into a seat
// array: an id, the label a guest reads, a position and the way the seat
// faces. Front Row's live screen is twelve seats in a close half-circle around
// the stage (Noel's spec: "a dozen seats, curved close around the stage").
// Each screen is its own house on frontrow-server (server/rooms.js), which
// takes the house's seat count from the socket handshake (pinned to 12 for
// Front Row's live screen) and accepts ids up to two digits.
import type { ScreenTemplate, SeatArrangement, SeatLayout } from '../theater/definition';
import { HOUSE_SEAT_CAP } from './roomScope';

export const SEAT_COUNT = 12;
/**
 * The most seats a layout may hold: the one place this number lives. Seat ids
 * run seat-0 … seat-98, inside the seat-\d{1,2} pattern the server and the
 * definition validator accept; it is roomScope.ts's HOUSE_SEAT_CAP, which
 * frontrow-server (server/rooms.js SEAT_CAP) enforces per house.
 */
export const MAX_LAYOUT_SEATS = HOUSE_SEAT_CAP;

/** The stage: a half-disc of radius 8 centered here, front edge at z = 0. */
const STAGE_Z = -8;
/** Where seats that face the stage look. */
const STAGE_FOCUS: [number, number] = [0, -5];

export interface SeatSpot {
  id: string;
  /** What a guest reads: A1 at house left. */
  label: string;
  position: [number, number, number];
  /** Yaw in radians; the seat's local +z points away from what it faces. */
  rotationY: number;
}

export const DEFAULT_LAYOUT: Required<SeatLayout> = { count: SEAT_COUNT, arrangement: 'semicircle' };

const TEMPLATE_ARRANGEMENT: Record<ScreenTemplate, SeatArrangement> = {
  proscenium: 'rows',
  cabaret: 'tables',
  'black-box': 'horseshoe',
  roundtable: 'round',
  custom: 'semicircle',
};

/** The arrangement a screen uses: its own if it names one, else its template's. */
export function arrangementFor(layout: SeatLayout | undefined, template?: ScreenTemplate): SeatArrangement {
  return layout?.arrangement ?? (template ? TEMPLATE_ARRANGEMENT[template] : DEFAULT_LAYOUT.arrangement);
}

function facing(x: number, z: number, [fx, fz]: [number, number]): number {
  return Math.atan2(x - fx, z - fz);
}

type Raw = { x: number; z: number; label: string; focus: [number, number] };

function semicircle(n: number): Raw[] {
  const radius = Math.max(9.5, n * 0.75);
  return Array.from({ length: n }, (_, i) => {
    const angle = n === 1 ? Math.PI / 2 : (i / (n - 1)) * Math.PI;
    // seat-0 is at house right, so A1 (house left) is the last seat.
    return { x: radius * Math.cos(angle), z: radius * Math.sin(angle) + STAGE_Z, label: `A${n - i}`, focus: STAGE_FOCUS };
  });
}

/** Proscenium: straight rows facing the stage, row A in front, staggered. */
function rows(n: number): Raw[] {
  const rowCount = Math.ceil(n / 8);
  const perRow = Math.ceil(n / rowCount);
  const out: Raw[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / perRow);
    const k = i % perRow;
    const inRow = Math.min(perRow, n - r * perRow);
    const x = (k - (inRow - 1) / 2) * 2.1 + (r % 2 ? 0.5 : 0);
    out.push({ x, z: 2 + r * 2.3, label: `${String.fromCharCode(65 + r)}${k + 1}`, focus: STAGE_FOCUS });
  }
  return out;
}

/** Cabaret: tables of up to four on an arc, chairs on the side away from the stage. */
function tables(n: number): Raw[] {
  const tableCount = Math.ceil(n / 4);
  const out: Raw[] = [];
  // Five tables to an arc; a sixth starts a second arc further back.
  const PER_RING = 5;
  for (let t = 0; t < tableCount; t++) {
    const ring = Math.floor(t / PER_RING);
    const inRing = Math.min(PER_RING, tableCount - ring * PER_RING);
    const k = t % PER_RING;
    const radius = 11 + ring * 4.5;
    const arc = Math.min(Math.PI * 0.8, 0.5 * inRing);
    const a = Math.PI / 2 + (inRing === 1 ? 0 : (k / (inRing - 1) - 0.5) * arc);
    const tx = -Math.cos(a) * radius;
    const tz = Math.sin(a) * radius + STAGE_Z;
    const chairs = Math.min(4, n - t * 4);
    // Chairs fan across the back of the table so nobody's back is to the stage.
    const toStage = Math.atan2(STAGE_FOCUS[0] - tx, STAGE_FOCUS[1] - tz);
    for (let c = 0; c < chairs; c++) {
      const spread = chairs === 1 ? 0 : (c / (chairs - 1) - 0.5) * Math.PI * 0.9;
      const back = toStage + Math.PI + spread;
      out.push({ x: tx + Math.sin(back) * 1.5, z: tz + Math.cos(back) * 1.5, label: `T${t + 1}-${c + 1}`, focus: STAGE_FOCUS });
    }
  }
  return out;
}

/** Round table: everyone in one circle in front of the stage, facing the middle. */
function round(n: number): Raw[] {
  const radius = Math.max(3.5, (n * 1.7) / (2 * Math.PI));
  const center: [number, number] = [0, 1 + radius];
  return Array.from({ length: n }, (_, i) => {
    const a = Math.PI + (i / n) * Math.PI * 2;
    return { x: center[0] + radius * Math.sin(a), z: center[1] + radius * Math.cos(a), label: `${i + 1}`, focus: center };
  });
}

/** Black box: a horseshoe on three sides of the playing area: left, front, right. */
function horseshoe(n: number): Raw[] {
  const side = Math.floor(n / 3);
  const front = n - side * 2;
  const out: Raw[] = [];
  const focus: [number, number] = [0, -3];
  for (let i = 0; i < side; i++) out.push({ x: -9.5, z: -6 + i * 2.1, label: `L${i + 1}`, focus });
  // The front row closes the horseshoe, never closer than the stage's edge.
  const frontZ = Math.max(1.5, -6 + side * 2.1 + 1.2);
  for (let i = 0; i < front; i++) out.push({ x: (i - (front - 1) / 2) * 2.1, z: frontZ, label: `C${i + 1}`, focus });
  for (let i = 0; i < side; i++) out.push({ x: 9.5, z: -6 + (side - 1 - i) * 2.1, label: `R${i + 1}`, focus });
  return out;
}

const BUILDERS: Record<SeatArrangement, (n: number) => Raw[]> = { semicircle, rows, tables, round, horseshoe };

/** The seat array for a screen. Ids are seat-0 … seat-(count-1). */
export function seatLayout(y = 0, layout: SeatLayout = DEFAULT_LAYOUT, template?: ScreenTemplate): SeatSpot[] {
  const n = Math.max(1, Math.min(MAX_LAYOUT_SEATS, Math.floor(layout.count || SEAT_COUNT)));
  const raw = BUILDERS[arrangementFor(layout, template)](n);
  return raw.map((s, i) => ({
    id: `seat-${i}`,
    label: s.label,
    position: [s.x, y, s.z],
    rotationY: facing(s.x, s.z, s.focus),
  }));
}

/** A seat's label in a given layout; the id itself if the layout has no such seat. */
export function labelIn(seats: SeatSpot[], id: string): string {
  return seats.find((s) => s.id === id)?.label ?? id;
}

/** Front Row's label for a seat id (twelve in a half-circle). Prefer useHouse().label. */
export function seatLabel(id: string): string {
  const n = Number(id.replace('seat-', ''));
  return Number.isFinite(n) ? `A${SEAT_COUNT - n}` : id;
}
