// The provider half of useHouse.ts: one per front-of-house page and the house.
import React, { useEffect, useMemo } from 'react';
import { TheaterDefinition } from './definition';
import { applyThemeVars } from './theme';
import { HouseContext, makeHouse } from './useHouse';

export function HouseProvider({ definition, screenId, children }: {
  definition: TheaterDefinition;
  screenId?: string;
  children: React.ReactNode;
}): JSX.Element {
  const house = useMemo(() => makeHouse(definition, screenId), [definition, screenId]);
  useEffect(() => applyThemeVars(house.palette), [house.palette]);
  return <HouseContext.Provider value={house}>{children}</HouseContext.Provider>;
}
