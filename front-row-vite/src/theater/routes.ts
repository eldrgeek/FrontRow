// Where each step of a guest's evening lives, and which show the URL names.
import { useParams } from 'react-router-dom';
import { CURRENT_SHOW_SLUG, Show } from './show';
import { useScheduledShow } from './schedule';

export function showPath(show: Show, step?: string): string {
  return step ? `/show/${show.slug}/${step}` : `/show/${show.slug}`;
}

/** Resolves the show from the URL (or tonight's show at /): the schedule's row, else the compiled one. */
export function useShowState(): { show: Show | null; loading: boolean } {
  const { slug } = useParams();
  return useScheduledShow(slug || CURRENT_SHOW_SLUG);
}

export function useShow(): Show | null {
  return useShowState().show;
}
