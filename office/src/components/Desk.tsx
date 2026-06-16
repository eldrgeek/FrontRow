import { useState } from 'react';
import type { Persona } from '../data/personas';
import { usePersonaText } from '../hooks/useCanon';
import { ChatPanel } from './ChatPanel';

export function Desk({ persona }: { persona: Persona }) {
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const text = usePersonaText(persona.slug, persona.fileExists);

  const tile = persona.cluster === 'orchestrator' ? 'desk-tile desk-elev' : 'desk-tile';

  return (
    <article
      className={tile}
      style={{ ['--accent' as string]: persona.accent }}
      aria-labelledby={`desk-${persona.slug}`}
    >
      <div className="desk-glyph" aria-hidden>{persona.glyph}</div>
      <header className="desk-head">
        <h3 id={`desk-${persona.slug}`} className="desk-name">{persona.name}</h3>
        <span className="desk-domain">{persona.domain}</span>
      </header>
      <p className="desk-role">{persona.role}</p>
      <p className="desk-voice">
        <span className="desk-voice-eyebrow">voice DNA</span>
        <span className="desk-voice-text">{persona.voiceDNA}</span>
      </p>
      {persona.artifact && (
        <div className="desk-artifact">
          <span>owns</span> <strong>{persona.artifact}</strong>
        </div>
      )}
      <footer className="desk-foot">
        {persona.voiceUrl && (
          <a
            className="desk-voice-url"
            href={persona.voiceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Talk by voice →
          </a>
        )}
        <button
          className="desk-meet-btn"
          onClick={() => { setChatOpen(o => !o); setOpen(false); }}
          aria-expanded={chatOpen}
        >
          {chatOpen ? 'close chat' : `Meet ${persona.name}`}
        </button>
        {persona.fileExists ? (
          <button
            className="desk-link"
            onClick={() => { setOpen(o => !o); setChatOpen(false); }}
            aria-expanded={open}
          >
            {open ? 'close' : 'open'} persona file
          </button>
        ) : (
          <span className="desk-stub">voice file pending</span>
        )}
      </footer>
      {open && text && (
        <pre className="desk-body" tabIndex={0}>{text}</pre>
      )}
      {chatOpen && (
        <ChatPanel persona={persona} systemPrompt={text} />
      )}
    </article>
  );
}
