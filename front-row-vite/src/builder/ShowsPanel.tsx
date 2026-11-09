// The builder's "Shows" section: schedule a night and move it along.
//
// Nights live in the performances table (migrations/006), not in the theater
// definition, so this section writes through schedule.ts's savePerformance
// (the save_performance RPC) instead of an edit op. The database decides who
// may: an admin, the theater's manager, or a performance manager of the screen.
//
// The front door (/) shows the night the live screen is running (doors through
// after), else the next one by start time: schedule.ts pickCurrent.

import React, { useCallback, useEffect, useState } from 'react';
import { listUpcoming, PerformanceRow, savePerformance } from '../theater/schedule';
import type { PerformanceStatus } from '../theater/show';
import { youtubeIdFrom } from './ops';
import { NEXT_STEP, reasonWords, slugFor, STATUS_WORDS } from './shows';

function wordsFor(d: Date): { when: string; doorsOpen: string } {
  const day = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return { when: `${day} · ${time}`, doorsOpen: time };
}

export function ShowsPanel({ theater, liveScreen, defaultSeats }: { theater: string; liveScreen: string; defaultSeats: number }): JSX.Element {
  const [nights, setNights] = useState<PerformanceRow[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [night, setNight] = useState('');
  const [doors, setDoors] = useState('');
  const [seats, setSeats] = useState(defaultSeats);
  const [video, setVideo] = useState('');
  const [tagline, setTagline] = useState('');

  const reload = useCallback(() => {
    listUpcoming(theater).then(setNights);
  }, [theater]);
  useEffect(reload, [reload]);

  const schedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (video && !youtubeIdFrom(video) && !/^https:\/\/\S+$/.test(video)) {
      setMsg({ ok: false, text: 'The stage video must be a YouTube link or an https video link.' });
      return;
    }
    const start = new Date(night);
    const open = doors ? new Date(doors) : new Date(start.getTime() - 15 * 60 * 1000);
    const slug = slugFor(artist, night);
    const words = wordsFor(start);
    const billing: PerformanceRow['billing'] = {
      stageName: artist.toUpperCase(),
      when: words.when,
      doorsOpen: wordsFor(open).doorsOpen,
    };
    if (tagline) billing.tagline = tagline;
    if (video) billing.fallbackVideoUrl = video;
    setBusy(true);
    const r = await savePerformance(theater, slug, {
      screen: liveScreen,
      title: title || artist,
      artist,
      billing,
      starts_at: start.toISOString(),
      doors_at: open.toISOString(),
      seats,
    });
    setBusy(false);
    if (r.ok === false) {
      setMsg({ ok: false, text: reasonWords(r.reason, r.detail) });
      return;
    }
    setMsg({ ok: true, text: r.created ? `Scheduled. Guests reach it at /show/${slug}.` : `Updated /show/${slug}.` });
    setArtist(''); setTitle(''); setNight(''); setDoors(''); setVideo(''); setTagline('');
    reload();
  };

  const move = async (row: PerformanceRow, to: PerformanceStatus) => {
    if (to === 'cancelled' && !window.confirm(`Cancel ${row.artist || row.title}? Tickets for it stop working.`)) return;
    setMsg(null);
    setBusy(true);
    const r = await savePerformance(theater, row.slug, { status: to });
    setBusy(false);
    if (r.ok === false) setMsg({ ok: false, text: reasonWords(r.reason, r.detail) });
    reload();
  };

  return (
    <div className="bp-group" data-testid="bp-shows">
      <h3>Shows</h3>
      {nights === null ? <p className="bp-muted">Loading the schedule…</p> : nights.length === 0 ? (
        <p className="bp-muted">Nothing scheduled.</p>
      ) : (
        <ol className="bp-screens" data-testid="bp-nights">
          {nights.map((row) => {
            const next = NEXT_STEP[row.status];
            return (
              <li key={row.slug} data-testid={`bp-night-${row.slug}`}>
                <a className="bp-link" href={`/show/${row.slug}`} target="_blank" rel="noreferrer">{row.artist || row.title}</a>
                <span className="bp-muted"> {row.starts_at ? new Date(row.starts_at).toLocaleString() : 'no date'} · {STATUS_WORDS[row.status]}</span>
                <span className="bp-row-actions">
                  {next ? <button type="button" disabled={busy} onClick={() => move(row, next.to)} data-testid={`bp-night-next-${row.slug}`}>{next.label}</button> : null}
                  {row.status !== 'after' ? <button type="button" disabled={busy} onClick={() => move(row, 'cancelled')}>Cancel</button> : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <form onSubmit={schedule} data-testid="bp-show-form">
        <label>Artist <input required maxLength={80} value={artist} onChange={(e) => setArtist(e.target.value)} data-testid="bp-show-artist" /></label>
        <label>Show title <input maxLength={120} value={title} placeholder="(the artist’s name)" onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Tagline <input maxLength={120} value={tagline} onChange={(e) => setTagline(e.target.value)} /></label>
        <label>Night <input type="datetime-local" required value={night} onChange={(e) => setNight(e.target.value)} data-testid="bp-show-night" /></label>
        <label>Doors <input type="datetime-local" value={doors} onChange={(e) => setDoors(e.target.value)} /></label>
        <label>Seats <input type="number" min={1} max={99} value={seats} onChange={(e) => setSeats(Number(e.target.value))} /></label>
        <label>Stage video while waiting <input value={video} placeholder="YouTube link" maxLength={490} onChange={(e) => setVideo(e.target.value.trim())} data-testid="bp-show-video" /></label>
        <button type="submit" className="primary" disabled={busy} data-testid="bp-show-schedule">Schedule night</button>
      </form>
      {msg ? <p className={msg.ok ? 'bp-muted' : 'bp-error'} role="status" data-testid="bp-show-msg">{msg.text}</p> : null}
      <p className="bp-muted">The front door shows the night that is running, else the next one. Move a night to “After the show” when it ends.</p>
    </div>
  );
}

export function VideoList({ screen, shelf, edit }: {
  screen: string; shelf: { title: string; artist: string; youtubeId?: string; videoUrl?: string }[];
  edit: (op: unknown, args: unknown) => Promise<void>;
}): JSX.Element {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [link, setLink] = useState('');
  const add = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const args: Record<string, unknown> = { screen, title, artist };
    if (youtubeIdFrom(link)) args.youtube = link; else args.videoUrl = link;
    edit('addShelfItem', args).then(() => { setTitle(''); setArtist(''); setLink(''); });
  };
  return (
    <div data-testid="bp-videos">
      <h4>Videos on this screen</h4>
      {shelf.length === 0 ? <p className="bp-muted">None yet.</p> : (
        <ol className="bp-screens">
          {shelf.map((v) => (
            <li key={v.youtubeId ?? v.videoUrl ?? v.title}>
              {v.title} <span className="bp-muted">{v.artist}</span>
              <span className="bp-row-actions">
                <button type="button" onClick={() => edit('removeShelfItem', { screen, item: v.youtubeId ?? v.videoUrl ?? v.title })}>Remove</button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="bp-subform">
        <label>Title <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} data-testid="bp-video-title" /></label>
        <label>Artist <input value={artist} maxLength={120} onChange={(e) => setArtist(e.target.value)} data-testid="bp-video-artist" /></label>
        <label>Link <input value={link} placeholder="YouTube or https video link" maxLength={490} onChange={(e) => setLink(e.target.value.trim())} data-testid="bp-video-link" /></label>
        <button type="button" onClick={add} disabled={!title || !artist || !link} data-testid="bp-video-add">Add video</button>
      </div>
    </div>
  );
}
