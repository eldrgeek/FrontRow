// Buy a ticket, pay what you want (box office, 2026-11-07). The money goes to
// Minds Aligned, LLC through Stripe Checkout; the ticket is made once Stripe
// says the payment went through. Rules: server/box-office-pay.mjs.
//   /buy/<theater>/<screen>/<night>   the offer
//   /buy/thanks?session_id=…          the ticket (shown here for 24 hours, and emailed)
import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { buy, dollars, type BuyInfo, type Claim } from '../lib/buy';
import './theater.css';
import './buy.css';

const when = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  : '');

export function BuyPage(): JSX.Element {
  const { venue = '', room = '', performance = '' } = useParams();
  const [info, setInfo] = useState<BuyInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pick, setPick] = useState<number | 'own'>(1000);
  const [own, setOwn] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    buy.info(venue, room, performance).then((i) => {
      setInfo(i);
      if (!i.price.suggested.includes(1000)) setPick(i.price.suggested[0]);
    }).catch((e) => setErr(e.message));
  }, [venue, room, performance]);

  const amount = pick === 'own' ? Math.round(Number(own) * 100) : pick;

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!info) return;
    if (!Number.isInteger(amount) || amount < info.price.min || amount > info.price.max) {
      setErr(`Pay what you want, from ${dollars(info.price.min)} to ${dollars(info.price.max)}.`);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const { url } = await buy.checkout({
        venue, room, performance, email: email.trim(), name: name.trim(), amount,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      window.location.assign(url);
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  if (!info) {
    return (
      <div className="fr"><div className="fr-center">
        {err ? <div className="fr-invite"><div className="fr-eyebrow">Front Row Theater</div><p>{err}</p></div> : <div aria-busy="true" />}
      </div></div>
    );
  }
  const s = info.show;
  return (
    <div className="fr" data-testid="fr-buy">
      <div className="fr-center">
        <div className="fr-invite fr-buy">
          <div className="fr-eyebrow">{s.theater}</div>
          <h1>{s.title}</h1>
          {s.artist && s.artist !== s.title ? <div className="tag">{s.artist}</div> : null}
          <div className="when">{when(s.startsAt)}</div>
          {info.onSale ? (
            <form onSubmit={pay}>
              <label htmlFor="buy-amount">Pay what you want</label>
              <div className="amounts" id="buy-amount" role="group" aria-label="Amount">
                {info.price.suggested.map((c) => (
                  <button key={c} type="button" aria-pressed={pick === c} onClick={() => setPick(c)}>{dollars(c)}</button>
                ))}
                <button type="button" aria-pressed={pick === 'own'} onClick={() => setPick('own')}>Other</button>
              </div>
              {pick === 'own' ? (
                <div className="own">$<input inputMode="decimal" aria-label="Your amount in dollars" value={own} onChange={(e) => setOwn(e.target.value)} placeholder="8" autoFocus /></div>
              ) : null}
              <label htmlFor="buy-name">Your name</label>
              <input id="buy-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" />
              <label htmlFor="buy-email">Email for your ticket</label>
              <input id="buy-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} autoComplete="email" />
              {err ? <p className="err" role="alert">{err}</p> : null}
              <button className="fr-btn" type="submit" disabled={busy}>
                {busy ? 'Opening the payment page…' : `Pay ${Number.isInteger(amount) && amount > 0 ? dollars(amount) : ''}`}
              </button>
              <p className="fine">
                One ticket, for one device. {info.seatsLeft <= 5 ? `${info.seatsLeft} seat${info.seatsLeft === 1 ? '' : 's'} left. ` : ''}
                You pay {info.payee} through Stripe; your ticket comes on the next page and by email.
              </p>
            </form>
          ) : (
            <p className="fine" data-testid="fr-buy-closed">{info.closed?.text || 'Tickets are not on sale.'}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function BuyThanksPage(): JSX.Element {
  const [params] = useSearchParams();
  const id = params.get('session_id') || '';
  const [c, setC] = useState<Claim | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let live = true;
    buy.claim(id).then((r) => { if (live) setC(r); }).catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [id, tries]);
  // A card can take a few seconds to clear; ask again a few times.
  useEffect(() => {
    if (c?.state !== 'pending' || tries >= 10) return;
    const t = setTimeout(() => setTries((n) => n + 1), 3000);
    return () => clearTimeout(t);
  }, [c, tries]);

  let body: React.ReactNode = <div aria-busy="true" />;
  if (err) body = <p>{err}</p>;
  else if (c?.state === 'pending') body = <p>{tries >= 10 ? 'Your payment has not come through yet. Your ticket will be emailed once it does.' : c.text}</p>;
  else if (c?.state === 'revoked') body = <p>This ticket was cancelled. If that is a surprise, reply to your ticket email.</p>;
  else if (c) {
    body = (
      <>
        <h1>You have a seat</h1>
        <p className="when">Thank you{c.amount ? ` for ${c.amount}` : ''}.</p>
        {c.link ? (
          <>
            <a className="fr-btn" href={c.link} data-testid="fr-buy-ticket">Open my ticket</a>
            <p className="fine">Open it on the phone or computer you will watch from; it works on one device. Keep this link to yourself.</p>
          </>
        ) : null}
        <p className="fine">
          {c.emailed ? `A copy is on its way to ${c.email}.` : `Your ticket is for ${c.email}.`}
          {!c.link ? ' Use the link in that email to come in.' : ''}
        </p>
      </>
    );
  }
  return (
    <div className="fr" data-testid="fr-buy-thanks">
      <div className="fr-center">
        <div className="fr-invite fr-buy">
          <div className="fr-eyebrow">Front Row Theater</div>
          {body}
        </div>
      </div>
    </div>
  );
}
