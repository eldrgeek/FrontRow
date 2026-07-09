import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Venue, Session } from '../types/frontrow';
import App from '../App';
import './Room.css';

export function Room() {
  const { venueId } = useParams<{ venueId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  const loadVenueData = useCallback(async () => {
    try {
      // Fetch venue
      const { data: venueData, error: venueError } = await supabase
        .from('venues')
        .select('*')
        .eq('id', venueId)
        .single();

      if (venueError) throw venueError;
      setVenue(venueData);

      // Fetch sessions for this venue
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .eq('venue_id', venueId)
        .order('created_at', { ascending: false });

      if (sessionsError) throw sessionsError;
      setSessions(sessionsData || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load venue';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    if (!venueId || !session?.user) return;
    loadVenueData();
  }, [venueId, session, loadVenueData]);

  // Once the audience member steps in, hand the whole screen to the 3D theater
  // (the legacy App experience: name/photo entry → seats, stage, backdrop video).
  if (entered) {
    // Fixed, viewport-sized mount: the legacy theater's own `.App { height:100vh }`
    // collapses to 0 in this embedded context, so R3F can't size its canvas.
    // A position:fixed wrapper is viewport-relative regardless of ancestor
    // heights; we force .App to fill it so the 3D scene renders full-screen.
    return (
      <div className="theater-mount">
        <button
          className="theater-exit-btn"
          onClick={() => setEntered(false)}
          title="Leave the theater"
        >
          ← Back to Lobby
        </button>
        <App />
      </div>
    );
  }

  const upcoming = sessions.find((s) => s.status === 'pre-show' || s.status === 'live');

  return (
    <div className="room-container">
      <header className="room-header">
        <button onClick={() => navigate('/')} className="btn-back">
          ← Back to Lobby
        </button>
        <h1>{venue?.name || 'Loading...'}</h1>
      </header>

      <main className="room-main">
        {loading && <div className="room-loading">Loading venue...</div>}
        {error && <div className="room-error">Error: {error}</div>}

        {!loading && venue && (
          <div className="room-content">
            <section className="room-info">
              <h2>{venue.name}</h2>
              <div className="room-meta">
                <p>
                  <strong>Status:</strong> {venue.active ? 'Active' : 'Inactive'}
                </p>
              </div>
            </section>

            <section className="room-sessions">
              <h2>Sessions ({sessions.length})</h2>
              {sessions.length === 0 && (
                <div className="room-empty">No sessions for this venue yet.</div>
              )}
              {sessions.length > 0 && (
                <div className="session-list">
                  {sessions.map((s) => (
                    <div key={s.id} className="session-item">
                      <h3>{s.title || 'Untitled Session'}</h3>
                      <p>Status: {s.status || 'idle'}</p>
                      <p>Created: {new Date(s.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="room-enter">
              {upcoming ? (
                <p className="enter-headline">
                  Tonight: <strong>{upcoming.title}</strong>
                </p>
              ) : (
                <p className="enter-headline">Step inside the theater</p>
              )}
              <button className="btn-enter-theater" onClick={() => setEntered(true)}>
                🎭 Enter the Theater
              </button>
              <p className="enter-subtitle">
                Take your seat — stage, backdrop, and the live performance await.
              </p>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
