// After the set: the house lights are up and the guests can talk to each
// other and to the artist before they go home (Noel's "post-show chat").
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChatChannel, ChatLine, CHAT_MAX } from './postShowChat';
import { Show } from './show';
import { showPath } from './routes';
import './postshow.css';

interface Props {
  show: Show;
  name: string;
  channel: ChatChannel;
  onClose: () => void;
  /** 'house': opened from the seat at any time. 'after': the lights are up (default). */
  variant?: 'after' | 'house';
}

export function PostShow({ show, name, channel, onClose, variant = 'after' }: Props): JSX.Element {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    setLines([]); // a new channel replays its history
    return channel.subscribe((l) => setLines((prev) => [...prev, l].slice(-100)));
  }, [channel]);
  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: 'end' });
  }, [lines]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    channel.send(name, text);
    setDraft('');
  };
  const fmt = useMemo(() => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }), []);

  return (
    <aside className="fr-post" data-testid="fr-postshow" data-variant={variant} aria-label={variant === 'house' ? 'House chat' : 'After the show'}>
      {variant === 'house' ? (
        <header>
          <div className="k">House chat</div>
          <div className="t">Everyone in the house</div>
          <div className="s">Open to the whole room, the stage included. Not private.</div>
        </header>
      ) : (
        <header>
          <div className="k">The house lights are up</div>
          <div className="t">Thank you for coming</div>
          <div className="s">Stay a while and talk with {show.artist} and the house.</div>
        </header>
      )}
      <ol ref={list} className="lines" aria-live="polite" data-testid="fr-chat-lines">
        {lines.length === 0 && <li className="empty">{variant === 'house' ? 'Nobody has said anything yet. Say hello.' : 'Nobody has said anything yet. Say how it was.'}</li>}
        {lines.map((l, i) => (
          <li key={`${l.at}-${i}`} className={l.mine ? 'mine' : ''}>
            <b>{l.name}</b> <time>{fmt.format(l.at)}</time>
            <div>{l.text}</div>
          </li>
        ))}
      </ol>
      <form onSubmit={send}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={CHAT_MAX}
          placeholder={`Say something as ${name}`}
          aria-label="Message"
          data-testid="fr-chat-input"
        />
        <button type="submit" disabled={!draft.trim()} data-testid="fr-chat-send">Send</button>
      </form>
      <footer>
        <Link to={showPath(show, 'lobby')}>Back to the lobby</Link>
        <Link to={showPath(show, 'library')}>The Library</Link>
        <button type="button" onClick={onClose} data-testid="fr-chat-close">{variant === 'house' ? 'Close the chat' : 'Stay in my seat'}</button>
      </footer>
    </aside>
  );
}
