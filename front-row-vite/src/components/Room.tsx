import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Venue, Session } from '../types/frontrow';
import './Room.css';

export function Room() {
  const { venueId } = useParams<{ venueId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

            {/* TODO: Phase 2 - Add 3D theater component, LiveKit integration, audience/performer controls */}
            <section className="room-placeholder">
              <p className="placeholder-text">3D theater experience loading...</p>
              <p className="placeholder-subtitle">This will render the venue's 3D space with performer and audience controls.</p>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
