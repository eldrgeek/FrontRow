// The house's seats, in one place. SeatSelection draws them, CameraController
// flies to them and UserView looks out from them, so all three must agree.
// Twelve seats in a close half-circle around the stage (Noel's spec: "a dozen
// seats, curved close around the stage"). frontrow-server caps how many are
// taken at once (MAX_SEATS there).

export const SEAT_COUNT = 12;
const RADIUS = 9.5;
const STAGE_Z = -8;

export interface SeatSpot {
  id: string;
  /** What a guest reads: A1 at house left through A12 at house right. */
  label: string;
  position: [number, number, number];
}

export function seatLabel(id: string): string {
  const n = Number(id.replace('seat-', ''));
  return Number.isFinite(n) ? `A${SEAT_COUNT - n}` : id;
}

export function seatLayout(y = 0): SeatSpot[] {
  return Array.from({ length: SEAT_COUNT }, (_, i) => {
    const angle = (i / (SEAT_COUNT - 1)) * Math.PI;
    const id = `seat-${i}`;
    return {
      id,
      label: seatLabel(id),
      position: [RADIUS * Math.cos(angle), y, RADIUS * Math.sin(angle) + STAGE_Z],
    };
  });
}
