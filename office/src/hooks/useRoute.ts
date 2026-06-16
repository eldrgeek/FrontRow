import { useEffect, useState } from 'react';

export type Route =
  | 'campus'
  | 'library' | 'studio' | 'booth' | 'situation'
  | 'tower' | 'workshop' | 'forge'
  | 'greenhouse' | 'garden' | 'switchboard'
  | 'cafe' | 'forum' | 'stage'
  | 'atrium' | 'lab' | 'guesthouse';

export const ROUTE_LABELS: Record<Route, string> = {
  campus:      'Campus',
  library:     'The Library',
  studio:      'The Studio',
  booth:       'The Booth',
  situation:   'The Situation Room',
  tower:       'The Tower',
  workshop:    'The Workshop',
  forge:       'The Forge',
  greenhouse:  'The Greenhouse',
  garden:      'The Garden',
  switchboard: 'The Switchboard',
  cafe:        'The Cafe',
  forum:       'The Forum',
  stage:       'The Stage',
  atrium:      'The Atrium',
  lab:         'The Lab',
  guesthouse:  'The Guest House',
};

const VALID = new Set(Object.keys(ROUTE_LABELS));

function readHash(): Route {
  const h = (location.hash || '').replace(/^#\/?/, '').toLowerCase();
  if (!h || !VALID.has(h)) return 'campus';
  return h as Route;
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => readHash());
  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (r: Route) => {
    location.hash = r === 'campus' ? '' : `/${r}`;
    if (r === 'campus' && location.hash) location.hash = '';
    setRoute(r);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  return [route, go];
}
