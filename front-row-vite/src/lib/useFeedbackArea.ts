import { useEffect } from 'react';

// WQ-128 — SOMA-APP-STANDARD.md §8, item 3: richer origin context on the
// soma-feedback widget. The widget reads a live `data-area` attribute off
// its nearest DOM ancestor (falling back to <body>) at submit time, so a
// single-page app can label its regions without a page reload — the card
// then says "rehearsal room" instead of just "playmaker".
//
// Sets document.body.dataset.area on mount, restores whatever was there
// (usually undefined) on unmount, so navigating away from a labeled page
// doesn't leave a stale area on a page that has none of its own.
export function useFeedbackArea(area: string): void {
  useEffect(() => {
    const prev = document.body.dataset.area;
    document.body.dataset.area = area;
    return () => {
      if (prev === undefined) delete document.body.dataset.area;
      else document.body.dataset.area = prev;
    };
  }, [area]);
}
