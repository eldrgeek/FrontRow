// FrontRow type definitions (SOMA upgrade)

export type UserRole = 'super_admin' | 'theater_manager' | 'performance_manager' | 'performer' | 'audience';

export interface Venue {
  id: string;
  super_venue_id: string | null;
  name: string;
  room_template_id: string;
  room_template?: RoomTemplate;
  theater_manager_id: string;
  active: boolean;
  created_at: string;
  created_by: string;
}

export interface RoomTemplate {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface VenueSettings {
  id: string;
  venue_id: string;
  config: Record<string, unknown>;
  updated_at: string;
  updated_by: string;
}

export interface Session {
  id: string;
  venue_id: string;
  venue?: Venue;
  title: string;
  status: 'idle' | 'pre-show' | 'live' | 'post-show';
  performer_ids: string[];
  started_by: string | null;
  can_replay: boolean;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  settings?: SessionSettings;
}

export interface SessionSettings {
  id: string;
  session_id: string;
  config: Record<string, unknown>;
  updated_at: string;
  updated_by: string | null;
}

export interface ShowFeedback {
  id: string;
  session_id: string;
  user_id: string;
  author_name: string | null; // Null = anonymous
  rating: number | null;
  text: string | null;
  viewed_how: 'attended' | 'replayed';
  created_at: string;
}

export interface FrontRowFeedback {
  id: string;
  type: 'bug' | 'feature';
  description: string;
  submitter_id: string;
  status: 'new' | 'approved' | 'built' | 'deferred';
  created_at: string;
}

export interface VenueChangelog {
  id: string;
  venue_id: string;
  change_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changed_by: string;
  created_at: string;
}

export interface SessionChangelog {
  id: string;
  session_id: string;
  event_type: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface FrontRowUser {
  id: string;
  email: string;
  role: UserRole; // Computed based on context (venue, session, etc)
  is_super_admin: boolean;
}

export interface AudienceSeat {
  name: string;
  imageUrl: string;
  socketId: string;
  captureMode: 'photo' | 'video';
  hasVideoStream?: boolean;
}

export interface RoomContextState {
  venueId: string;
  sessionId: string | null;
  currentView: 'eye-in-the-sky' | 'performer' | 'user';
  showState: 'idle' | 'pre-show' | 'live' | 'post-show';
  performerOnStage: boolean;
  curtainOpen: boolean;
  audienceSeats: Map<string, AudienceSeat>;
}
