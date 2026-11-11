// /show/<slug>/green-room: the performer's door. Signed-in FrontRow admins
// only (Mike, Jess, George: the same gate as every admin action, checked by
// /api/am-i-frontrow-admin). Everyone else is sent to sign in, or told kindly
// that this door is for the artist.
import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import App from '../App';
import { NoSuchShow } from './FrontOfHouse';
import { showPath, useShow } from './routes';
import './theater.css';

type Gate = 'checking' | 'yes' | 'no';

export function GreenRoomPage(): JSX.Element {
  const show = useShow();
  const { session, loading } = useAuth();
  const [gate, setGate] = useState<Gate>('checking');

  useEffect(() => {
    if (loading) return;
    const token = session?.access_token;
    if (!token) {
      setGate('no');
      return;
    }
    let live = true;
    fetch('/api/am-i-frontrow-admin', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { admin: false }))
      .then((j) => live && setGate(j?.admin ? 'yes' : 'no'))
      .catch(() => live && setGate('no'));
    return () => {
      live = false;
    };
  }, [session, loading]);

  if (!show) return <NoSuchShow />;
  if (!loading && !session) {
    return <Navigate to={`/login?next=${encodeURIComponent(showPath(show, 'green-room'))}`} replace />;
  }
  if (gate === 'yes') {
    const meta = (session?.user?.user_metadata || {}) as { full_name?: string; name?: string };
    const who = (meta.full_name || meta.name || session?.user?.email?.split('@')[0] || '').slice(0, 40);
    return <App entry={{ name: show.artist, showSlug: show.slug, role: 'performer', performingAs: who || show.artist }} />;
  }
  return (
    <div className="fr" data-testid="fr-green-gate">
      <div className="fr-center">
        <div className="fr-eyebrow">Backstage</div>
        {gate === 'checking' ? (
          <p style={{ fontFamily: 'var(--serif)', fontSize: 22 }}>Checking your pass…</p>
        ) : (
          <>
            <p style={{ fontFamily: 'var(--serif)', fontSize: 24, textAlign: 'center', maxWidth: 440 }}>
              This door is for {show.artist} and the crew. Your seat is out front.
            </p>
            <a className="fr-btn" href={showPath(show)}>Back to the invitation</a>
          </>
        )}
      </div>
    </div>
  );
}
