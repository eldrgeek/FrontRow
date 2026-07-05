import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Venue } from '../types/frontrow';
import './Lobby.css';

export function Lobby() {
  const navigate = useNavigate();
  const { user, session, signOut } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user) {
      navigate('/login');
      return;
    }

    loadVenues();
  }, [session, navigate]);

  async function loadVenues() {
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('*, room_template:room_templates(*)')
        .eq('active', true)
        .order('name');

      if (error) throw error;
      setVenues(data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load venues';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return <div className="lobby-loading">Loading...</div>;
  }

  return (
    <div className="lobby-container">
      <header className="lobby-header">
        <div className="lobby-header-content">
          <h1>FrontRow</h1>
          <div className="lobby-user-info">
            <span>{user.email}</span>
            {user.is_super_admin && <span className="badge badge-admin">Admin</span>}
            <button onClick={() => signOut()} className="btn-logout">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="lobby-main">
        <section className="lobby-section">
          <h2>Active Venues</h2>
          {loading && <div className="lobby-loading-spinner">Loading venues...</div>}
          {error && <div className="lobby-error">{error}</div>}

          {!loading && venues.length === 0 && (
            <div className="lobby-empty">No active venues at this time.</div>
          )}

          {!loading && venues.length > 0 && (
            <div className="venue-grid">
              {venues.map((venue) => (
                <div
                  key={venue.id}
                  className="venue-card"
                  onClick={() => navigate(`/venue/${venue.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      navigate(`/venue/${venue.id}`);
                    }
                  }}
                >
                  <div className="venue-card-body">
                    <h3>{venue.name}</h3>
                    <p className="venue-card-template">{venue.room_template?.name || 'Theater'}</p>
                  </div>
                  <div className="venue-card-status">
                    <span className="badge badge-active">Active</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {user.is_super_admin && (
          <section className="lobby-section admin-section">
            <h2>Administration</h2>
            <button
              onClick={() => navigate('/admin')}
              className="btn btn-primary"
            >
              Admin Dashboard
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
