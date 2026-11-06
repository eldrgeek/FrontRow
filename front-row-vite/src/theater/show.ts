// Front Row Theater: the shows the front of house knows about.
//
// One show is "tonight's". The invite, ticket, lobby and house all read from
// here, so a new night is a new entry in SHOWS, not a code change elsewhere.
// Dates are display strings until a real schedule exists (ROADMAP.md §6).

export type DoorId = 'revolution' | 'live' | 'library';

export interface ShelfVideo {
  title: string;
  artist: string;
  youtubeId: string;
  note?: string;
}

export interface Door {
  id: DoorId;
  /** Words on the marquee above the door, one entry per line. */
  marquee: string[];
  title: string;
  blurb: string;
  side: 'left' | 'center' | 'right';
}

export interface Show {
  slug: string;
  artist: string;
  /** Painted on the stage boards. */
  stageName: string;
  tagline: string;
  when: string;
  doorsOpen: string;
  setLength: string;
  invitedBy: string;
  seats: number;
  /** Plays on the stage screen until the performer's own stream arrives. */
  fallbackVideoUrl: string;
}

export const SHOWS: Record<string, Show> = {
  'jess-wayne': {
    slug: 'jess-wayne',
    artist: 'Jess Wayne',
    stageName: 'JESS WAYNE',
    tagline: 'live at Front Row Theater',
    when: 'Friday · 8:00 pm',
    doorsOpen: '7:45 pm',
    setLength: 'Twenty-minute set and an encore',
    invitedBy: 'Noel, Harold, George and the Hootnet gang',
    seats: 12,
    fallbackVideoUrl: 'https://youtu.be/K6ZeroIZd5g',
  },
};

export const CURRENT_SHOW_SLUG = 'jess-wayne';

export function getShow(slug?: string): Show | null {
  return SHOWS[slug || CURRENT_SHOW_SLUG] || null;
}

export function doorsFor(show: Show): Door[] {
  return [
    {
      id: 'revolution',
      side: 'left',
      marquee: ['Songs of the', 'Revolution'],
      title: 'Songs of the Revolution',
      blurb: 'Three-to-five-minute music videos. Short, urgent songs, playing all the time.',
    },
    {
      id: 'live',
      side: 'center',
      marquee: ['Live tonight', show.artist],
      title: `${show.artist}, live`,
      blurb: `${show.when}. ${show.setLength}. Twelve seats, close to the stage.`,
    },
    {
      id: 'library',
      side: 'right',
      marquee: ['Performance', 'Library'],
      title: 'The Performance Library',
      blurb: 'Full concerts and past shows, ready whenever you want a front row seat.',
    },
  ];
}

// What plays behind the side doors. Placeholder shelves until Noel and Jess
// send the real lists (plan: "What I need").
export const SHELVES: Record<Exclude<DoorId, 'live'>, ShelfVideo[]> = {
  revolution: [],
  library: [
    {
      title: 'Jess Wayne Trio, Part III',
      artist: 'Jess Wayne Trio',
      youtubeId: 'K6ZeroIZd5g',
      note: 'A full set, 25 minutes.',
    },
  ],
};
