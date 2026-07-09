import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Venue, Session, ShowFeedback } from '../types/frontrow';
import './AdminDashboard.css';

export function AdminDashboard() {
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'venues' | 'sessions' | 'feedback'>('venues');

  useEffect(() => {
    if (!user || !isSuperAdmin) {
      navigate('/');
      return;
    }

    loadData();
  }, [user, isSuperAdmin, navigate]);

  async function loadData() {
    try {
      // Load all venues
      const { data: venuesData, error: venuesError } = await supabase
        .from('venues')
        .select('*')
        .order('name');

      if (venuesError) throw venuesError;
      setVenues(venuesData || []);

      // Load all sessions
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*, venue:venues(name)')
        .order('created_at', { ascending: false });

      if (sessionsError) throw sessionsError;
      setSessions(sessionsData || []);
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleVenueStatus(venueId: string, currentActive: boolean) {
    try {
      const { error } = await supabase
        .from('venues')
        .update({ active: !currentActive })
        .eq('id', venueId);

      if (error) throw error;
      loadData(); // Refresh
    } catch (error) {
      console.error('Error updating venue:', error);
    }
  }

  if (!user || !isSuperAdmin) {
    return null;
  }

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <h1>FrontRow Administration</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => navigate('/admin/feedback')} className="btn-back">
            Feedback queue →
          </button>
          <button onClick={() => navigate('/')} className="btn-back">
            ← Back to Lobby
          </button>
        </div>
      </header>

      <nav className="admin-tabs">
        <button
          className={`tab ${activeTab === 'venues' ? 'active' : ''}`}
          onClick={() => setActiveTab('venues')}
        >
          Venues ({venues.length})
        </button>
        <button
          className={`tab ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          Sessions ({sessions.length})
        </button>
        <button
          className={`tab ${activeTab === 'feedback' ? 'active' : ''}`}
          onClick={() => setActiveTab('feedback')}
        >
          Feedback
        </button>
      </nav>

      <main className="admin-content">
        {loading && <div className="loading">Loading...</div>}

        {!loading && activeTab === 'venues' && (
          <section className="admin-section">
            <div className="section-header">
              <h2>Venues</h2>
              <button className="btn btn-primary" onClick={() => navigate('/admin/create-venue')}>
                + Create Venue
              </button>
            </div>

            {venues.length === 0 ? (
              <div className="empty-state">No venues yet</div>
            ) : (
              <div className="table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Manager</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {venues.map((venue) => (
                      <tr key={venue.id}>
                        <td>
                          <strong>{venue.name}</strong>
                        </td>
                        <td>{venue.theater_manager_id}</td>
                        <td>
                          <span className={`badge ${venue.active ? 'badge-active' : 'badge-inactive'}`}>
                            {venue.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn-small"
                            onClick={() => handleToggleVenueStatus(venue.id, venue.active)}
                          >
                            {venue.active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            className="btn-small"
                            onClick={() => navigate(`/admin/venue/${venue.id}`)}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {!loading && activeTab === 'sessions' && (
          <section className="admin-section">
            <h2>Sessions</h2>
            {sessions.length === 0 ? (
              <div className="empty-state">No sessions yet</div>
            ) : (
              <div className="table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Venue</th>
                      <th>Status</th>
                      <th>Started</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr key={session.id}>
                        <td>
                          <strong>{session.title}</strong>
                        </td>
                        <td>{(session.venue as any)?.name || 'Unknown'}</td>
                        <td>
                          <span className={`badge badge-${session.status}`}>{session.status}</span>
                        </td>
                        <td>{session.started_at ? '✓' : '−'}</td>
                        <td>
                          <button
                            className="btn-small"
                            onClick={() => navigate(`/admin/session/${session.id}`)}
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {!loading && activeTab === 'feedback' && (
          <section className="admin-section">
            <h2>Design Feedback</h2>
            <p className="section-description">
              Feedback from team members about FrontRow improvements
            </p>
            {/* Feedback list will be implemented next */}
            <div className="empty-state">Coming soon</div>
          </section>
        )}
      </main>
    </div>
  );
}
