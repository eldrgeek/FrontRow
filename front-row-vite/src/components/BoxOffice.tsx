// The box office (theater kit gap 3, 2026-11-05): send tickets by email, make
// printable door cards, mark door sales, and watch who has a ticket.
// Route: /box-office?venue=front-row&room=live&performance=jess-wayne
//
// Sending is two steps on purpose: "Check the list" asks the server who would
// get what (it issues nothing); the confirm names every recipient and the
// sender; only "Send" issues tickets, and the server refuses it if the list
// changed. Letters go out from Mike's Mac, which may be asleep or switched
// off: each one shows Waiting for Mike's Mac, Sent, or Not sent with why.
//
// Payment is not taken here. "Sold" records that a door card was handed over.
import { useCallback, useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { boxOffice, type BoxList, type DoorCard, type Preview, type Scope } from '../lib/boxOffice';
import { listUpcoming, type PerformanceRow } from '../theater/schedule';

const pad = (n: number) => String(n).padStart(2, '0');
function localInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function qrSvg(text: string) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
}
const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const MAIL_STATE: Record<string, string> = {
  queued: "Waiting for Mike's Mac",
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Not sent',
};

export function BoxOffice() {
  const params = new URLSearchParams(window.location.search);
  const [scope, setScope] = useState<Scope>({
    venue: params.get('venue') || 'front-row',
    room: params.get('room') || 'live',
    performance: params.get('performance') || '',
  });
  const start = useMemo(() => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d; }, []);
  const [from, setFrom] = useState(localInput(start));
  const [until, setUntil] = useState(localInput(new Date(start.getTime() + 4 * 3600e3)));
  const [theaterTitle, setTheaterTitle] = useState('Front Row Theater');
  const [showTitle, setShowTitle] = useState('');
  const [devices, setDevices] = useState(1);
  const [guests, setGuests] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [doorCount, setDoorCount] = useState(10);
  const [cards, setCards] = useState<DoorCard[] | null>(null);
  const [data, setData] = useState<BoxList | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Tickets are sold only for a scheduled night (006 refuses any other), so the
  // show comes from the schedule; free text only when the schedule is empty.
  const [nights, setNights] = useState<PerformanceRow[]>([]);
  useEffect(() => {
    let live = true;
    listUpcoming(scope.venue).then((rows) => { if (live) setNights(rows); });
    return () => { live = false; };
  }, [scope.venue]);
  const screenNights = nights.filter((n) => !n.screen || n.screen.screen_key === scope.room);
  const pickNight = (slug: string) => {
    setScope((sc) => ({ ...sc, performance: slug }));
    const n = nights.find((x) => x.slug === slug);
    if (!n) return;
    setShowTitle(n.artist || n.title);
    const doors = n.doors_at || n.starts_at;
    if (doors) setFrom(localInput(new Date(doors)));
    if (n.starts_at) setUntil(localInput(new Date(new Date(n.starts_at).getTime() + 4 * 3600e3)));
  };

  const window_ = () => ({ validFrom: new Date(from).toISOString(), validUntil: new Date(until).toISOString() });
  const letterFields = () => ({ ...window_(), role: 'audience', maxDevices: devices, theaterTitle, showTitle, timeZone, guests });

  const refresh = useCallback(async () => {
    try { setData(await boxOffice.list(scope)); } catch (e) { setMsg({ kind: 'err', text: (e as Error).message }); }
  }, [scope]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 20e3); // letters change state as Mike's Mac works
    return () => clearInterval(t);
  }, [refresh]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ kind: 'err', text: (e as Error).message }); } finally { setBusy(false); }
  };

  const check = () => run(async () => { setPreview(await boxOffice.preview(scope, letterFields())); });
  const send = () => run(async () => {
    if (!preview) return;
    const r = await boxOffice.send(scope, letterFields(), preview.recipients.map((x) => x.email));
    setPreview(null); setGuests('');
    setMsg({ kind: 'ok', text: `${r.letters.length} tickets issued. Their letters are waiting for Mike's Mac to send them.` });
    await refresh();
  });
  const makeDoor = () => run(async () => {
    const r = await boxOffice.door(scope, { ...window_(), count: doorCount });
    setCards(r.cards);
    await refresh();
  });

  const w = data?.worker;
  const macLine = !data?.mailReady
    ? 'Ticket mail is not set up on this site yet: letters cannot be queued.'
    : !w ? "Mike's Mac has never checked in. Letters will wait for it."
      : !w.connected ? `Mike's Mac last checked in ${fmt(w.lastSeenAt)}. Letters will wait for it.`
        : !w.armed ? `Mike's Mac (${w.host}) is connected, but its mail is switched off. Letters wait until it is on.`
          : `Mike's Mac (${w.host}) is connected and sending.`;

  const s = data?.summary || {};
  const field = { display: 'block', marginBottom: 8 } as const;
  const input = { marginLeft: 8, padding: 4 } as const;

  return (
    <div className="box-office" style={{ maxWidth: 900, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif', color: '#111', background: '#fff' }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #door-sheet, #door-sheet * { visibility: visible; }
          #door-sheet { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
        #door-sheet .card { break-inside: avoid; border: 1px dashed #999; padding: 10px; display: flex; gap: 12px; align-items: center; }
        #door-sheet .card svg { width: 110px; height: 110px; }
        #door-sheet { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; }
        .box-office table { width: 100%; border-collapse: collapse; font-size: 14px; }
        .box-office td, .box-office th { border-bottom: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: top; }
        .box-office section { border: 1px solid #ccc; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
      `}</style>

      <h1 className="no-print">Box office</h1>
      <p className="no-print" style={{ color: '#555' }}>Payment is not taken here yet. A door card marked sold only records who it was handed to.</p>

      <section className="no-print">
        <h2>Which performance</h2>
        <label style={field}>Theater<input style={input} value={scope.venue} onChange={(e) => setScope({ ...scope, venue: e.target.value.trim() })} /></label>
        <label style={field}>Screen
          {data?.screens
            ? <select style={input} value={scope.room} onChange={(e) => setScope({ ...scope, room: e.target.value })}>
                {data.screens.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            : <input style={input} value={scope.room} onChange={(e) => setScope({ ...scope, room: e.target.value.trim() })} />}
        </label>
        <label style={field}>Performance
          {screenNights.length
            ? <select style={input} value={scope.performance} onChange={(e) => pickNight(e.target.value)}>
                <option value="">Choose a night</option>
                {screenNights.map((n) => (
                  <option key={n.slug} value={n.slug}>
                    {n.artist || n.title}{n.starts_at ? `, ${fmt(n.starts_at)}` : ''} ({n.status})
                  </option>
                ))}
              </select>
            : <input style={input} placeholder="show slug, e.g. jess-wayne" value={scope.performance} onChange={(e) => setScope({ ...scope, performance: e.target.value.trim() })} />}
        </label>
        {data?.performance === null && scope.performance && screenNights.length === 0 && (
          <p style={{ color: '#a00' }}>No such night is scheduled on this screen; schedule it before selling tickets.</p>
        )}
        <label style={field}>Doors open<input style={input} type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label style={field}>Tickets work until<input style={input} type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} /></label>
        {data && (
          <p>
            {data.performance && <>Night: <b>{data.performance.artist || data.performance.title}</b> ({data.performance.status}). </>}
            {s.seats !== undefined && <>Seats promised: <b>{s.seatsPromised} of {s.seats}</b>. </>}
            Sent: {s.sent} ({s.delivered} delivered, {s.waiting} waiting, {s.notSent} not sent). Door cards: {s.door} ({s.doorSold} handed out). In the house at least once: {s.used}.
          </p>
        )}
      </section>

      <section className="no-print">
        <h2>Send tickets by email</h2>
        <p style={{ color: '#555' }}>{macLine}</p>
        <label style={field}>Theater name in the letter<input style={input} value={theaterTitle} onChange={(e) => setTheaterTitle(e.target.value)} /></label>
        <label style={field}>Show name in the letter<input style={input} value={showTitle} onChange={(e) => setShowTitle(e.target.value)} /></label>
        <label style={field}>Devices per ticket<input style={input} type="number" min={1} max={10} value={devices} onChange={(e) => setDevices(Number(e.target.value) || 1)} /></label>
        <label style={field}>Guest list, one per line ("Ann Lee &lt;ann@example.com&gt;" or just the address)
          <textarea style={{ display: 'block', width: '100%', minHeight: 120, marginTop: 4 }} value={guests} onChange={(e) => { setGuests(e.target.value); setPreview(null); }} />
        </label>
        <button disabled={busy || !guests.trim()} onClick={check}>Check the list</button>

        {preview && (
          <div style={{ marginTop: 12, padding: 12, background: '#fff8e1', borderRadius: 6 }}>
            <h3 style={{ marginTop: 0 }}>Send {preview.recipients.length} ticket{preview.recipients.length === 1 ? '' : 's'}?</h3>
            <p>From: {preview.sender.display} &lt;{preview.sender.email}&gt;, sent from Mike's Mac.<br />Subject: {preview.subject}</p>
            <p>Each of these people gets their own ticket:</p>
            <ol>{preview.recipients.map((r) => <li key={r.email}>{r.name ? `${r.name} ` : ''}&lt;{r.email}&gt;</li>)}</ol>
            {preview.refused.length > 0 && (
              <>
                <p>Left out:</p>
                <ul>{preview.refused.map((r, i) => <li key={i}>{r.entry}: {r.reason}</li>)}</ul>
              </>
            )}
            <details><summary>The letter</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{preview.sample}</pre></details>
            {!preview.mailReady && <p style={{ color: '#a00' }}>Ticket mail is not set up on this site, so Send will refuse and issue nothing.</p>}
            <button disabled={busy} onClick={send}>Send {preview.recipients.length} ticket{preview.recipients.length === 1 ? '' : 's'}</button>{' '}
            <button disabled={busy} onClick={() => setPreview(null)}>Cancel</button>
          </div>
        )}
      </section>

      <section className="no-print">
        <h2>Door cards</h2>
        <p style={{ color: '#555' }}>Each card lets one device in. The codes are shown once, here: print them before you leave this page.</p>
        <label style={field}>How many<input style={input} type="number" min={1} max={100} value={doorCount} onChange={(e) => setDoorCount(Number(e.target.value) || 1)} /></label>
        <button disabled={busy} onClick={makeDoor}>Make door cards</button>{' '}
        {cards && <button onClick={() => window.print()}>Print {cards.length} cards</button>}
      </section>

      {msg && <p className="no-print" role="status" style={{ color: msg.kind === 'err' ? '#a00' : '#060' }}>{msg.text}</p>}

      {cards && (
        <div id="door-sheet">
          {cards.map((c) => (
            <div className="card" key={c.id}>
              <div dangerouslySetInnerHTML={{ __html: qrSvg(c.link) }} />
              <div>
                <b>{theaterTitle}</b><br />
                {showTitle || scope.performance}<br />
                <b>{c.label}</b><br />
                <small>Doors {fmt(new Date(from).toISOString())}</small><br />
                <small style={{ wordBreak: 'break-all' }}>{c.link}</small>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="no-print">
        <h2>Tickets <button onClick={refresh} disabled={busy}>Refresh</button></h2>
        <table>
          <thead><tr><th>Who</th><th>How</th><th>State</th><th>Used</th><th></th></tr></thead>
          <tbody>
            {(data?.tickets || []).map((t) => (
              <tr key={t.id} style={t.revoked_at ? { color: '#999', textDecoration: 'line-through' } : undefined}>
                <td>{t.label || t.holder || 'unnamed'}{t.sold_note ? ` (to ${t.sold_note})` : ''}</td>
                <td>{t.channel === 'sent' ? 'email' : t.channel}</td>
                <td>
                  {t.revoked_at ? 'revoked'
                    : t.mail ? <>{MAIL_STATE[t.mail.state]}{t.mail.error ? `: ${t.mail.error}` : ''}</>
                      : t.channel === 'door' ? (t.sold_at ? 'handed out' : 'at the door') : ''}
                </td>
                <td>{t.claimed}/{t.max_devices}</td>
                <td>
                  {!t.revoked_at && t.channel === 'door' && (
                    t.sold_at
                      ? <button disabled={busy} onClick={() => run(async () => { await boxOffice.sold(t.id, false); await refresh(); })}>Undo sold</button>
                      : <button disabled={busy} onClick={() => run(async () => {
                          const note = window.prompt(`Who is ${t.label} for? (optional)`) ?? '';
                          await boxOffice.sold(t.id, true, note); await refresh();
                        })}>Sold</button>
                  )}{' '}
                  {!t.revoked_at && t.mail?.retryable && <button disabled={busy} onClick={() => run(async () => { await boxOffice.retry(t.mail!.id); await refresh(); })}>Retry</button>}{' '}
                  {!t.revoked_at && <button disabled={busy} onClick={() => run(async () => { await boxOffice.revoke(t.id); await refresh(); })}>Revoke</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default BoxOffice;
