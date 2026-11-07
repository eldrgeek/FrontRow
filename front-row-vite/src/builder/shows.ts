// Words and rules for the builder's Shows section (ShowsPanel.tsx).
import type { PerformanceStatus } from '../theater/show';

/** The one forward step each status offers, in the words on its button. */
export const NEXT_STEP: Partial<Record<PerformanceStatus, { to: PerformanceStatus; label: string }>> = {
  scheduled: { to: 'tickets-out', label: 'Tickets out' },
  'tickets-out': { to: 'doors', label: 'Open doors' },
  doors: { to: 'green-room', label: 'Green room' },
  'green-room': { to: 'curtain', label: 'Curtain' },
  curtain: { to: 'after', label: 'After the show' },
};

export const STATUS_WORDS: Record<PerformanceStatus, string> = {
  scheduled: 'scheduled',
  'tickets-out': 'tickets out',
  doors: 'doors open',
  'green-room': 'green room',
  curtain: 'on stage',
  after: 'after the show',
  library: 'in the library',
  cancelled: 'cancelled',
};

export const REASONS: Record<string, string> = {
  'not-allowed': 'Only an admin or this theater’s manager can schedule nights.',
  'no-theater': 'This theater is not stored yet, so it has no schedule.',
  'no-screen': 'That screen is not set up in the database yet.',
  'screen-required': 'Pick the screen the night plays on.',
  'title-required': 'Give the show a title.',
  backwards: 'A night only moves forward.',
  'too-late-to-cancel': 'The show is over; it can no longer be cancelled.',
  'screen-not-open': 'The screen is not open yet, so the night cannot go to the green room or the stage.',
  closed: 'That night is filed or cancelled; it cannot change.',
  'bad-field': 'One of the fields is not valid.',
};

export function reasonWords(reason: string, detail?: string): string {
  return REASONS[reason] ?? (detail ? `${reason}: ${detail}` : reason);
}

/** A slug from an artist and a date: "Jess Wayne", 2026-12-04 → jess-wayne-2026-12-04. */
export function slugFor(artist: string, night: string): string {
  const base = artist.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'show';
  const day = /^\d{4}-\d{2}-\d{2}/.exec(night)?.[0];
  return (day ? `${base}-${day}` : base).replace(/-+/g, '-');
}

