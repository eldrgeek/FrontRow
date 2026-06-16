import { BuildingFrame } from '../components/BuildingFrame';
import { Desk } from '../components/Desk';
import { PERSONAS } from '../data/personas';

const PROJECTS = [
  { title: 'SAA85 — Act I underscore',       status: 'in-progress', note: 'leitmotif for Ruth established' },
  { title: 'Documentary — Charon intro sting', status: 'review',     note: 'Drew notes: "needs 4 beats of air"' },
  { title: 'Pulse v0 — UI sound palette',      status: 'sketching',  note: 'three options, branching from the core motif' },
  { title: 'SOMA briefing jingle',             status: 'done',       note: 'shipped — 8s ident, two variations' },
];

const REFERENCE_TRACKS = [
  { title: 'Ennio Morricone — "The Good, The Bad and The Ugly"', note: 'motif compression' },
  { title: 'Nico Muhly — "Keep in Touch"',                       note: 'text-setting pace' },
  { title: 'Jon Batiste — "I Need You"',                         note: 'warmth without sentimentality' },
  { title: 'Bartók — String Quartet No. 4',                      note: 'tension structure' },
];

export function Stage({ onBack }: { onBack: () => void }) {
  const riff = PERSONAS.find(p => p.slug === 'riff')!;
  return (
    <BuildingFrame
      route="stage"
      eyebrow="music · scoring · sound design"
      title="The Stage"
      inhabitants="Riff"
      vibe="a room built to hold sound. score sheets, reference tracks, a corner piano."
      onBack={onBack}
    >
      <div className="stage-shell">
        <div className="stage-projects" aria-label="Current scoring projects">
          <div className="stage-eyebrow">scenes in progress</div>
          <div className="stage-project-list">
            {PROJECTS.map((p, i) => (
              <div key={i} className={`stage-project stage-project-${p.status}`}>
                <div className="stage-project-head">
                  <strong>{p.title}</strong>
                  <span className="stage-project-status">{p.status}</span>
                </div>
                <div className="stage-project-note">{p.note}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="stage-refs" aria-label="Reference tracks">
          <div className="stage-eyebrow">reference tracks</div>
          <ul className="stage-ref-list">
            {REFERENCE_TRACKS.map((r, i) => (
              <li key={i} className="stage-ref">
                <strong>{r.title}</strong>
                <em>{r.note}</em>
              </li>
            ))}
          </ul>
          <div className="stage-piano" aria-hidden>
            {/* ASCII piano keys */}
            <div className="stage-piano-keys">
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="stage-key stage-key-white" />
              ))}
            </div>
            <div className="stage-piano-blacks">
              {[0, 1, 3, 4, 5, 7, 8, 10, 11, 12].map((i) => (
                <div key={i} className="stage-key-black" style={{ left: `${(i * 100) / 13}%` }} />
              ))}
            </div>
          </div>
        </div>
        <div className="stage-desk">
          <Desk persona={riff} />
        </div>
      </div>
    </BuildingFrame>
  );
}
