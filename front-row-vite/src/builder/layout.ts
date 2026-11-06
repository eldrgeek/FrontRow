// Where doors and seats go in the builder's preview.
//
// Layout rule (kit vision): up to 3 doors in a row, up to 6 in an arc, more
// down a corridor with a sign on each door.

import type { ScreenTemplate, SeatArrangement, SeatLayout } from '../theater/definition';
import { arrangementFor, seatLayout } from '../lib/seatLayout';

export type LobbyLayout = 'row' | 'arc' | 'corridor';

export function lobbyLayout(n: number): LobbyLayout {
  return n <= 3 ? 'row' : n <= 6 ? 'arc' : 'corridor';
}

export interface FloorPlan {
  /** Seat centres, in a box 100 wide and `height` tall. */
  seats: [number, number][];
  stage: { x: number; y: number; w: number; h: number };
  height: number;
  /** The arrangement guests see (the layout's own, or its template's). */
  arrangement: SeatArrangement;
}

/**
 * The house's real seat layout (lib/seatLayout.ts, the one the 3D house uses),
 * seen from above and scaled into a 100-wide box with the stage at the top.
 */
export function floorPlan(layout: SeatLayout, template?: ScreenTemplate): FloorPlan {
  const spots = seatLayout(0, layout, template);
  // The stage: x -8..8, z -8..0 (lib/seatLayout.ts).
  const xs = [-8, 8, ...spots.map((p) => p.position[0])];
  const zs = [-8, 0, ...spots.map((p) => p.position[2])];
  const minX = Math.min(...xs) - 1.5;
  const maxX = Math.max(...xs) + 1.5;
  const minZ = Math.min(...zs) - 1.5;
  const maxZ = Math.max(...zs) + 1.5;
  const k = 100 / Math.max(maxX - minX, 1);
  const px = (x: number) => (x - minX) * k;
  const pz = (z: number) => (z - minZ) * k;
  return {
    seats: spots.map((p) => [px(p.position[0]), pz(p.position[2])]),
    stage: { x: px(-8), y: pz(-8), w: 16 * k, h: 8 * k },
    height: Math.max(40, (maxZ - minZ) * k),
    arrangement: arrangementFor(layout, template),
  };
}
