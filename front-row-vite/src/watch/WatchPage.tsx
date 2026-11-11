// /watch/<video>: one of our YouTube videos on our own page, with a thumbs up or
// down for each scene as it plays. When the video ends the page asks whether
// the viewer will say more, starting with the scenes they gave a thumbs down.
// (Mike, 2026-11-11.) No account. Videos and scenes: ./videos.json. Rules:
// server/video-feedback.mjs.
//
// /watch/<video>/results: the thumbs per scene and what viewers wrote, for
// FrontRow admins.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { findVideo, fmtTime, loadFeedback, sceneAt, sendFeedback, storeFeedback, type Feedback, type SendResult, type Thumb, type Video } from './feedback';
import { loadYouTube, STATE, type YTPlayer } from './youtube';
import '../theater/theater.css';
import './watch.css';

type Ask = 'closed' | 'ask' | 'detail' | 'thanks' | 'declined';

export function WatchPage(): JSX.Element {
  const { video: slug } = useParams();
  const video = findVideo(slug);
  if (!video) {
    return (
      <div className="fr fr-watch">
        <div className="fr-center">
          <p className="fr-eyebrow">Front Row Theater</p>
          <h1 className="w-title">No such video</h1>
        </div>
      </div>
    );
  }
  return <Watch key={video.slug} video={video} />;
}

function Watch({ video }: { video: Video }): JSX.Element {
  const [fb, setFb] = useState<Feedback>(() => loadFeedback(video.slug));
  const [t, setT] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask>('closed');
  const [sent, setSent] = useState<SendResult | null>(null);
  const [touched, setTouched] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const scene = sceneAt(video, t);
  const downs = video.scenes.filter((s) => fb.reactions[s.id] === 'down');
  const others = video.scenes.filter((s) => fb.reactions[s.id] !== 'down');

  const update = useCallback((fn: (f: Feedback) => Feedback) => {
    setTouched(true);
    setFb((f) => fn(f));
  }, []);

  // Keep every change in this browser at once, and send it a moment later.
  useEffect(() => {
    storeFeedback(video.slug, fb);
    if (!touched) return;
    const id = window.setTimeout(() => {
      sendFeedback(video, fb).then(setSent);
    }, 900);
    return () => window.clearTimeout(id);
  }, [fb, touched, video]);

  const ended = useCallback(() => {
    update((f) => ({ ...f, finished: true }));
    setAsk((a) => (a === 'closed' ? 'ask' : a));
  }, [update]);

  useEffect(() => {
    if (!video.youtubeId || !holder.current) return;
    let live = true;
    let poll = 0;
    const el = document.createElement('div');
    holder.current.appendChild(el);
    loadYouTube()
      .then((YT) => {
        if (!live) return;
        player.current = new YT.Player(el, {
          videoId: video.youtubeId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: () => live && setReady(true),
            onStateChange: (e) => {
              if (e.data === STATE.ENDED) ended();
            },
          },
        });
        poll = window.setInterval(() => {
          const p = player.current;
          if (p && typeof p.getCurrentTime === 'function') setT(p.getCurrentTime() || 0);
        }, 250);
      })
      .catch((e) => live && setLoadErr(e.message));
    return () => {
      live = false;
      window.clearInterval(poll);
      try {
        player.current?.destroy();
      } catch {
        /* already gone */
      }
      player.current = null;
    };
  }, [video.youtubeId, ended]);

  useEffect(() => {
    if (ask !== 'closed') panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [ask]);

  const thumb = (sceneId: string, v: Thumb) =>
    update((f) => {
      const reactions = { ...f.reactions };
      if (reactions[sceneId] === v) delete reactions[sceneId];
      else reactions[sceneId] = v;
      return { ...f, reactions };
    });

  const seek = (s: number) => {
    player.current?.seekTo(s + 0.05, true);
    player.current?.playVideo();
    setT(s + 0.05);
  };

  return (
    <div className="fr fr-watch">
      <main className="w-main">
        <p className="fr-eyebrow">Front Row Theater</p>
        <h1 className="w-title">{video.title}</h1>
        <p className="w-lede">Give each scene a thumbs up or down as it plays. Change your mind any time.</p>

        <div className="w-frame" ref={holder} data-ready={ready ? 'yes' : 'no'}>
          {!video.youtubeId && <p className="w-note">This video isn&rsquo;t on YouTube yet.</p>}
          {loadErr && <p className="w-note">The player didn&rsquo;t load. {loadErr}.</p>}
        </div>

        <section className="w-now" aria-live="polite">
          <div className="w-now-text">
            <span className="w-now-time">{fmtTime(scene.start)}</span>
            <span className="w-now-label">{scene.label}</span>
          </div>
          <Thumbs value={fb.reactions[scene.id]} onPick={(v) => thumb(scene.id, v)} label={scene.label} big />
        </section>

        <ol className="w-strip" aria-label="Scenes">
          {video.scenes.map((s) => (
            <li
              key={s.id}
              style={{ flexGrow: s.end - s.start }}
              className={s.id === scene.id ? 'on' : ''}
              data-thumb={fb.reactions[s.id] || 'none'}
            >
              <button type="button" onClick={() => seek(s.start)} title={`${fmtTime(s.start)} ${s.label}`}>
                <span className="sr">{`${s.label}${fb.reactions[s.id] ? `, thumbs ${fb.reactions[s.id]}` : ''}`}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="w-under">
          <span className="w-count">
            {Object.values(fb.reactions).filter((v) => v === 'up').length} up · {downs.length} down
          </span>
          <SaveNote touched={touched} sent={sent} />
          {ask === 'closed' && (
            <button type="button" className="fr-link w-skip" onClick={() => setAsk('ask')}>
              Done watching? Say more
            </button>
          )}
        </div>

        {ask !== 'closed' && (
          <section className="w-panel" ref={panel}>
            {ask === 'ask' && (
              <>
                <h2>Thanks for watching.</h2>
                <p>
                  {downs.length
                    ? `You gave ${downs.length === 1 ? 'one scene' : `${downs.length} scenes`} a thumbs down. Would you tell us a little more about ${downs.length === 1 ? 'it' : 'them'}?`
                    : 'Would you tell us a little more about what worked and what didn’t?'}
                </p>
                <div className="w-row">
                  <button type="button" className="fr-btn" onClick={() => { update((f) => ({ ...f, wantsDetail: true })); setAsk('detail'); }}>
                    Yes, I&rsquo;ll say more
                  </button>
                  <button type="button" className="fr-btn ghost" onClick={() => { update((f) => ({ ...f, wantsDetail: false })); setAsk('declined'); }}>
                    No thanks
                  </button>
                </div>
              </>
            )}

            {ask === 'detail' && (
              <form onSubmit={(e) => { e.preventDefault(); sendFeedback(video, fb).then(setSent); setAsk('thanks'); }}>
                {downs.length > 0 && <h2>The scenes you gave a thumbs down</h2>}
                {downs.map((s) => (
                  <SceneNote key={s.id} scene={s} fb={fb} update={update} thumb={thumb} prompt="What didn’t work here?" />
                ))}
                <details className="w-more" open={downs.length === 0}>
                  <summary>{downs.length ? 'Any other scene' : 'Pick any scene'}</summary>
                  {others.map((s) => (
                    <SceneNote key={s.id} scene={s} fb={fb} update={update} thumb={thumb} prompt="Anything about this scene?" />
                  ))}
                </details>
                <label className="w-field">
                  <span>Anything else about the whole video?</span>
                  <textarea rows={3} maxLength={4000} value={fb.comment} onChange={(e) => { const v = e.target.value; update((f) => ({ ...f, comment: v })); }} />
                </label>
                <label className="w-field">
                  <span>Your name or email, if you&rsquo;d like us to follow up (optional)</span>
                  <input type="text" maxLength={120} autoComplete="email" value={fb.contact} onChange={(e) => { const v = e.target.value; update((f) => ({ ...f, contact: v })); }} />
                </label>
                <div className="w-row">
                  <button type="submit" className="fr-btn">Send</button>
                </div>
              </form>
            )}

            {ask === 'thanks' && (
              <>
                <h2>Thank you.</h2>
                <p>Every note goes to the people making these videos. You can come back and change anything on this page.</p>
                <div className="w-row">
                  <button type="button" className="fr-btn ghost" onClick={() => setAsk('detail')}>Change my notes</button>
                  <button type="button" className="fr-btn ghost" onClick={() => { setAsk('closed'); seek(0); }}>Watch again</button>
                </div>
              </>
            )}

            {ask === 'declined' && (
              <>
                <h2>Thanks. Your thumbs are in.</h2>
                <div className="w-row">
                  <button type="button" className="fr-btn ghost" onClick={() => { update((f) => ({ ...f, wantsDetail: true })); setAsk('detail'); }}>Actually, I&rsquo;ll say more</button>
                  <button type="button" className="fr-btn ghost" onClick={() => { setAsk('closed'); seek(0); }}>Watch again</button>
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function SaveNote({ touched, sent }: { touched: boolean; sent: SendResult | null }): JSX.Element | null {
  if (!touched || !sent) return null;
  if (sent === 'sent') return <span className="w-saved">Saved</span>;
  return <span className="w-saved warn">Kept on this device. We couldn&rsquo;t send it yet.</span>;
}

function Thumbs({ value, onPick, label, big }: { value?: Thumb; onPick: (v: Thumb) => void; label: string; big?: boolean }): JSX.Element {
  return (
    <div className={`w-thumbs${big ? ' big' : ''}`} role="group" aria-label={`Your reaction to ${label}`}>
      <button type="button" aria-pressed={value === 'up'} aria-label="Thumbs up" data-v="up" onClick={() => onPick('up')}>
        <span aria-hidden="true">👍</span>
      </button>
      <button type="button" aria-pressed={value === 'down'} aria-label="Thumbs down" data-v="down" onClick={() => onPick('down')}>
        <span aria-hidden="true">👎</span>
      </button>
    </div>
  );
}

function SceneNote({ scene, fb, update, thumb, prompt }: {
  scene: Video['scenes'][number];
  fb: Feedback;
  update: (fn: (f: Feedback) => Feedback) => void;
  thumb: (id: string, v: Thumb) => void;
  prompt: string;
}): JSX.Element {
  return (
    <div className="w-scene" data-scene={scene.id}>
      <div className="w-scene-head">
        <span className="w-now-time">{fmtTime(scene.start)}</span>
        <strong>{scene.label}</strong>
        <Thumbs value={fb.reactions[scene.id]} onPick={(v) => thumb(scene.id, v)} label={scene.label} />
      </div>
      {scene.says && <p className="w-says">&ldquo;{scene.says}&rdquo;</p>}
      <label className="w-field">
        <span>{prompt}</span>
        <textarea
          rows={2}
          maxLength={2000}
          value={fb.details[scene.id] || ''}
          onChange={(e) => {
            const v = e.target.value;
            update((f) => ({ ...f, details: { ...f.details, [scene.id]: v } }));
          }}
        />
      </label>
    </div>
  );
}

// ── Results, for admins ─────────────────────────────────────────────────────

interface Summary {
  viewers: number;
  finished: number;
  saidMore: number;
  scenes: Record<string, { up: number; down: number }>;
  notes: { reactions: Record<string, Thumb>; details: Record<string, string>; comment: string | null; contact: string | null; finished: boolean; at: string }[];
}

export function WatchResultsPage(): JSX.Element {
  const { video: slug } = useParams();
  const video = findVideo(slug);
  const { session, loading } = useAuth();
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !session?.access_token || !video) return;
    let live = true;
    fetch(`/api/video-feedback-summary?video=${encodeURIComponent(video.slug)}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!live) return;
        if (r.ok) setData(j);
        else setErr(j.error || `Something went wrong (${r.status})`);
      })
      .catch((e) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [session, loading, video]);

  const label = useMemo(() => Object.fromEntries((video?.scenes || []).map((s) => [s.id, s.label])), [video]);

  if (!video) return <Navigate to="/" replace />;
  if (!loading && !session) return <Navigate to={`/login?next=${encodeURIComponent(`/watch/${video.slug}/results`)}`} replace />;
  const most = data ? Math.max(1, ...Object.values(data.scenes).map((s) => s.up + s.down)) : 1;

  return (
    <div className="fr fr-watch">
      <main className="w-main">
        <p className="fr-eyebrow">Feedback</p>
        <h1 className="w-title">{video.title}</h1>
        <p className="w-lede"><Link className="fr-link" to={`/watch/${video.slug}`}>The watch page</Link></p>
        {err && <p className="w-note">{err}</p>}
        {!data && !err && <p className="w-note">Loading…</p>}
        {data && (
          <>
            <p className="w-lede">
              {data.viewers} {data.viewers === 1 ? 'viewer' : 'viewers'} · {data.finished} watched to the end · {data.saidMore} said they&rsquo;d say more
            </p>
            <table className="w-results">
              <thead>
                <tr><th>At</th><th>Scene</th><th>👍</th><th>👎</th><th aria-label="Bar" /></tr>
              </thead>
              <tbody>
                {video.scenes.map((s) => {
                  const c = data.scenes[s.id] || { up: 0, down: 0 };
                  return (
                    <tr key={s.id} data-scene={s.id}>
                      <td>{fmtTime(s.start)}</td>
                      <td>{s.label}</td>
                      <td>{c.up}</td>
                      <td>{c.down}</td>
                      <td className="bar">
                        <span className="up" style={{ width: `${(c.up / most) * 100}%` }} />
                        <span className="down" style={{ width: `${(c.down / most) * 100}%` }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <h2 className="w-h2">What viewers wrote</h2>
            {data.notes.length === 0 && <p className="w-note">Nothing yet.</p>}
            {data.notes.map((n, i) => (
              <article className="w-scene" key={i}>
                <div className="w-scene-head">
                  <span className="w-now-time">{new Date(n.at).toLocaleString()}</span>
                  {n.contact && <strong>{n.contact}</strong>}
                </div>
                {Object.entries(n.details).map(([k, v]) => (
                  <p key={k}><b>{label[k] || k}</b> {n.reactions[k] === 'down' ? '👎' : n.reactions[k] === 'up' ? '👍' : ''}: {v}</p>
                ))}
                {n.comment && <p><b>Overall:</b> {n.comment}</p>}
              </article>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
