// Where the doors go, from the theater definition's screens.
//
// Up to three doors stand in a row (Noel's Front Row). Four or five stand on
// a curved wall, an arc, turned toward the guest. More than five: the lobby
// keeps five on the arc (the live screen always among them) and the rest go
// down a hallway, reached from a sign at the side of the lobby. Noel's caution
// that many doors confuse a guest is why the lobby itself never shows more
// than five.
import { fill, ScreenDefinition } from './definition';
import type { Show } from './show';
import { showPath } from './routes';

export const ROW_MAX = 3;
export const ARC_MAX = 5;

export type LobbyMode = 'row' | 'arc' | 'hallway';

export interface DoorSlot {
  screen: ScreenDefinition;
  /** 0-based position among the doors in the same place (lobby or hallway). */
  index: number;
  where: 'lobby' | 'hallway';
  /** Arc only: how far the door is turned toward the guest, degrees. */
  turn: number;
  /** Arc only: edge doors stand a little smaller. */
  scale: number;
  /** Hallway only: which wall. */
  wall?: 'left' | 'right';
  /** The words a guest hears for where this door is. */
  place: string;
  /** The live screen's door is larger and glows. */
  featured: boolean;
  /** Narrower door (arc or hallway): fewer marquee bulbs. */
  compact: boolean;
}

export interface LobbyLayout {
  mode: LobbyMode;
  lobby: DoorSlot[];
  hallway: DoorSlot[];
}

const ROW_PLACES: Record<number, string[]> = {
  1: ['The door'],
  2: ['Left door', 'Right door'],
  3: ['Left door', 'Centre door', 'Right door'],
};

/** Lays out screens (in definition order) as lobby and hallway doors. */
export function layoutDoors(screens: ScreenDefinition[]): LobbyLayout {
  const ordered = [...screens].sort((a, b) => a.order - b.order);
  const n = ordered.length;
  const mode: LobbyMode = n <= ROW_MAX ? 'row' : n <= ARC_MAX ? 'arc' : 'hallway';

  let inLobby = ordered;
  let inHall: ScreenDefinition[] = [];
  if (mode === 'hallway') {
    // The live screen keeps its lobby door; the others take the remaining
    // places in order. The lobby keeps the builder's left-to-right order.
    const live = ordered.find((s) => s.kind === 'live');
    const others = ordered.filter((s) => s !== live);
    const keep = new Set([...(live ? [live] : []), ...others.slice(0, ARC_MAX - (live ? 1 : 0))]);
    inLobby = ordered.filter((s) => keep.has(s));
    inHall = ordered.filter((s) => !keep.has(s));
  }

  const m = inLobby.length;
  const lobby = inLobby.map((screen, i): DoorSlot => {
    const t = m === 1 ? 0 : (i / (m - 1)) * 2 - 1; // -1 at the left end, +1 at the right
    const arc = mode !== 'row';
    return {
      screen,
      index: i,
      where: 'lobby',
      turn: arc ? -t * 22 : 0,
      scale: arc ? 1 - 0.1 * Math.abs(t) : 1,
      place: mode === 'row' ? ROW_PLACES[m][i] : `Door ${i + 1} of ${m}`,
      featured: screen.kind === 'live',
      compact: arc,
    };
  });

  const hallway = inHall.map((screen, i): DoorSlot => ({
    screen,
    index: i,
    where: 'hallway',
    turn: 0,
    scale: 1,
    wall: i % 2 === 0 ? 'left' : 'right',
    place: `Down the hallway, ${i % 2 === 0 ? 'on the left' : 'on the right'}`,
    featured: screen.kind === 'live',
    compact: true,
  }));

  return { mode, lobby, hallway };
}

/** Where a door leads: the house for the live screen, the shelf for the rest. */
export function doorPath(show: Show, screen: ScreenDefinition): string {
  if (screen.kind === 'live') return showPath(show, 'house');
  if (screen.id === 'revolution' || screen.id === 'library') return showPath(show, screen.id);
  return showPath(show, `shelf/${screen.id}`);
}

/** A door's words with tonight's show filled in. */
export interface DoorWords {
  marquee: string[];
  title: string;
  blurb: string;
}

export function doorWords(show: Show, screen: ScreenDefinition): DoorWords {
  return {
    marquee: screen.marquee.map((l) => fill(l, show, screen)),
    title: fill(screen.title, show, screen),
    blurb: fill(screen.blurb, show, screen),
  };
}

