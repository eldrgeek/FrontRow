// Where each step of a guest's evening lives, and which show the URL names.
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { CURRENT_SHOW_SLUG, getShow, Show } from './show';

export function showPath(show: Show, step?: string): string {
  return step ? `/show/${show.slug}/${step}` : `/show/${show.slug}`;
}

/** Resolves the show from the URL (or tonight's show at /). */
export function useShow(): Show | null {
  const { slug } = useParams();
  return useMemo(() => getShow(slug || CURRENT_SHOW_SLUG), [slug]);
}
