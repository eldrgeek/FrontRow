// Behind the side doors: Songs of the Revolution and the Performance Library.
import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { fill, screensInOrder, ShelfVideo, TheaterDefinition } from './definition';
import { useTheater } from './theaterStore';
import { WithTicket } from './FrontOfHouse';
import { showPath } from './routes';
import './shelf.css';

function VideoCard({ v, playing, onPlay }: { v: ShelfVideo; playing: boolean; onPlay: () => void }): JSX.Element {
  return (
    <article className="fr-video">
      <div className="frame">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${v.youtubeId}?autoplay=1&rel=0`}
            title={v.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button type="button" className="poster" onClick={onPlay} aria-label={`Play ${v.title}`}>
            <img src={`https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg`} alt="" loading="lazy" />
            <span className="play" aria-hidden="true">▶</span>
          </button>
        )}
      </div>
      <h3>{v.title}</h3>
      <div className="by">{v.artist}{v.note ? ` · ${v.note}` : ''}</div>
    </article>
  );
}

/** Which door a screen is, in the words the lobby uses. */
function doorWord(def: TheaterDefinition, screenId: string): string {
  const screens = screensInOrder(def);
  const i = screens.findIndex((s) => s.id === screenId);
  const live = screens.findIndex((s) => s.kind === 'live');
  if (screens.length === 3 && live === 1) return i < live ? 'Left door' : 'Right door';
  return `Door ${i + 1}`;
}

/**
 * Any shelf screen of the theater, by id: /show/:slug/revolution and
 * /show/:slug/library (Front Row's two), or /show/:slug/shelf/:screenId.
 */
export function ShelfPage({ which }: { which?: string }): JSX.Element {
  const navigate = useNavigate();
  const { slug, screenId } = useParams();
  const id = which ?? screenId ?? '';
  const { record } = useTheater();
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => setPlaying(null), [id, slug]);

  return (
    <WithTicket>
      {(show) => {
        const def = record?.definition;
        const screen = def?.screens.find((s) => s.id === id && s.kind === 'shelf');
        if (!def || !screen) return <Navigate to={showPath(show, 'lobby')} replace />;
        const door = { title: fill(screen.title, show, screen), blurb: fill(screen.blurb, show, screen) };
        const videos: ShelfVideo[] = screen.shelf ?? [];
        return (
          <div className="fr fr-shelf" data-testid={`fr-shelf-${screen.id}`}>
            <header>
              <button type="button" className="fr-link" onClick={() => navigate(showPath(show, 'lobby'))}>← Back to the lobby</button>
              <div className="fr-eyebrow">{doorWord(def, screen.id)}</div>
              <h1>{door.title}</h1>
              <p>{door.blurb}</p>
            </header>
            <div className="grid">
              {videos.map((v) => (
                <VideoCard key={v.youtubeId} v={v} playing={playing === v.youtubeId} onPlay={() => setPlaying(v.youtubeId)} />
              ))}
              {videos.length === 0 && (
                <div className="soon">
                  <h3>Opening soon</h3>
                  <p>Noel and Jess are choosing the first songs for this room.</p>
                </div>
              )}
            </div>
            <footer>
              <button type="button" className="fr-btn" onClick={() => navigate(showPath(show, 'house'))}>
                Tonight: {show.artist}, live. Take your seat
              </button>
            </footer>
          </div>
        );
      }}
    </WithTicket>
  );
}
