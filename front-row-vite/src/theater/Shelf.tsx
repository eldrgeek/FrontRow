// Behind the side doors: Songs of the Revolution and the Performance Library.
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doorsFor, SHELVES, ShelfVideo } from './show';
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

export function ShelfPage({ which }: { which: 'revolution' | 'library' }): JSX.Element {
  const navigate = useNavigate();
  const { slug } = useParams();
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => setPlaying(null), [which, slug]);

  return (
    <WithTicket>
      {(show) => {
        const door = doorsFor(show).find((d) => d.id === which)!;
        const videos = SHELVES[which];
        return (
          <div className="fr fr-shelf" data-testid={`fr-shelf-${which}`}>
            <header>
              <button type="button" className="fr-link" onClick={() => navigate(showPath(show, 'lobby'))}>← Back to the lobby</button>
              <div className="fr-eyebrow">{door.side === 'left' ? 'Left door' : 'Right door'}</div>
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
