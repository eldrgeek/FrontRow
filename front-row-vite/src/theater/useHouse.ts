// The house a guest is in: which theater, which screen, its seats and colors.
//
// One provider wraps each front-of-house page and the 3D house (React context
// crosses the react-three-fiber Canvas in v8). SeatSelection, CameraController,
// UserView, the stage and the HUD all read the seat array and the palette from
// here, so a template change moves every one of them together.
import { createContext, useContext } from 'react';
import { frontRowTheater, liveScreen, getScreen, ScreenDefinition, TheaterDefinition } from './definition';
import { HousePalette, resolvePalette } from './theme';
import { DEFAULT_LAYOUT, SeatSpot, labelIn, seatLayout } from '../lib/seatLayout';

export interface House {
  definition: TheaterDefinition;
  /** The live screen the house shows (or the one asked for). */
  screen: ScreenDefinition | undefined;
  palette: HousePalette;
  /** Seats at floor level (y = 0). Use seatsAt(y) for a raised copy. */
  seats: SeatSpot[];
  seatsAt: (y: number) => SeatSpot[];
  label: (seatId: string) => string;
}

export function makeHouse(definition: TheaterDefinition, screenId?: string): House {
  // One live screen per theater until each room has its own seat map on the
  // server; a second one is an error, never a quiet pick of the first.
  const lives = definition.screens.filter((s) => s.kind === 'live');
  if (lives.length > 1) {
    throw new Error(`Theater "${definition.slug}" has ${lives.length} live screens; only one is supported for now`);
  }
  const screen = (screenId && getScreen(definition, screenId)) || liveScreen(definition);
  const layout = screen?.seats ?? DEFAULT_LAYOUT;
  const seats = seatLayout(0, layout, screen?.template);
  const seatsAt = (y: number) => seats.map((s) => ({ ...s, position: [s.position[0], y, s.position[2]] as [number, number, number] }));
  return {
    definition,
    screen,
    palette: resolvePalette(definition.theme),
    seats,
    seatsAt,
    label: (id) => labelIn(seats, id),
  };
}

const FRONT_ROW_HOUSE = makeHouse(frontRowTheater);
export const HouseContext = createContext<House>(FRONT_ROW_HOUSE);

/** The current house; Front Row's when no provider is above (master's routes). */
export function useHouse(): House {
  return useContext(HouseContext);
}

