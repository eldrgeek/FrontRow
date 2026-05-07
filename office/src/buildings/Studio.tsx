import { BuildingFrame } from '../components/BuildingFrame';
import { Desk } from '../components/Desk';
import { PERSONAS } from '../data/personas';

const DRAFT_FRAGMENTS = [
  'Open on the metadata layer — the proof is always there.',
  'Charon: 0.92× pace. Half-step under the line.',
  'Cut the second clause. The sentence does the work without it.',
  'The register slipped in paragraph four — pull it back.',
  'NOT NPR. SV-startup, weird-adjacent.',
  'Land the ending on a noun, not a clause.',
];

export function Studio({ onBack }: { onBack: () => void }) {
  const drew = PERSONAS.find(p => p.slug === 'drew')!;
  const pax = PERSONAS.find(p => p.slug === 'pax')!;
  return (
    <BuildingFrame
      route="studio"
      eyebrow="words that get spoken"
      title="The Studio"
      inhabitants="Drew · Pax"
      vibe="long writing room — typewriters, pinned drafts, register on the wall"
      onBack={onBack}
    >
      <div className="studio-shell">
        <div className="studio-corkboard" aria-label="Pinned draft fragments">
          <div className="studio-eyebrow">today's pinboard</div>
          <ul className="studio-pins">
            {DRAFT_FRAGMENTS.map((f, i) => (
              <li key={i} className="studio-pin" style={{ ['--rot' as any]: `${(i % 3 - 1) * 1.4}deg` }}>
                <span className="studio-pin-tack" aria-hidden />
                <p>{f}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="studio-typewriter" aria-hidden>
          <pre>
{`        _________________________________________
       /                                         \\
      |   THE STUDIO                              |
      |   ============                            |
      |                                           |
      |   Drew worries about words.               |
      |   Pax worries about register.             |
      |   Together: the line earns its place.     |
      |                                           |
      |   ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮      |
       \\_________________________________________/
        ===========================================`}
          </pre>
        </div>
        <div className="studio-desks">
          <Desk persona={drew} />
          <Desk persona={pax} />
        </div>
      </div>
    </BuildingFrame>
  );
}
