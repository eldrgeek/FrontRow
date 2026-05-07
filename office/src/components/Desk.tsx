import { useState } from 'react';
import type { Persona } from '../data/personas';
import { usePersonaText } from '../hooks/useCanon';

export function Desk({ persona }: { persona: Persona }) {
  const [open, setOpen] = useState(false);
  const text = usePersonaText(persona.slug, persona.fileExists);

  // micro-touches per persona — small visual flourishes that echo their domain
  const tile = persona.cluster === 'orchestrator' ? 'desk-tile desk-elev' : 'desk-tile';

  return (
    <article
      className={tile}
      style={{ ['--accent' as any]: persona.accent }}
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
        {persona.fileExists ? (
          <button className="desk-link" onClick={() => setOpen(o => !o)} aria-expanded={open}>
            {open ? 'close' : 'open'} persona file
          </button>
        ) : (
          <span className="desk-stub">voice file pending</span>
        )}
      </footer>
      {open && text && (
        <pre className="desk-body" tabIndex={0}>{text}</pre>
      )}
    </article>
  );
}
