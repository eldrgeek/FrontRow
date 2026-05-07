import { BuildingFrame } from '../components/BuildingFrame';
import { Desk } from '../components/Desk';
import { PERSONAS } from '../data/personas';

const SEEDS = [
  { name: 'Q3 Kickstarter — TBD',  stage: 'seedling',  signal: 'list at 1.4× target' },
  { name: 'Pulse v0 launch',        stage: 'budding',   signal: 'pre-announce ready' },
  { name: 'AI WTF Substack v2',     stage: 'flowering', signal: 'ship cadence steady' },
  { name: 'Documentary trailer',    stage: 'sprouting', signal: 'Drew + Sona pairing' },
];

export function Greenhouse({ onBack }: { onBack: () => void }) {
  const tilt = PERSONAS.find(p => p.slug === 'tilt')!;
  const kit = PERSONAS.find(p => p.slug === 'kit')!;
  return (
    <BuildingFrame
      route="greenhouse"
      eyebrow="things that need light and time"
      title="The Greenhouse"
      inhabitants="Tilt · Kit"
      vibe="glass walls. tables of seedlings. a pre-launch nursery."
      onBack={onBack}
    >
      <div className="green-shell">
        <div className="green-tables" aria-label="Seedling tables">
          <div className="green-eyebrow">growing right now</div>
          <div className="green-grid">
            {SEEDS.map((s, i) => (
              <div key={i} className={`green-pot stage-${s.stage}`}>
                <div className="green-stem" aria-hidden>
                  <span className="green-leaf" />
                  <span className="green-leaf" />
                </div>
                <div className="green-name">{s.name}</div>
                <div className="green-stage">{s.stage}</div>
                <div className="green-signal">{s.signal}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="green-desks">
          <Desk persona={tilt} />
          <Desk persona={kit} />
        </div>
        <div className="green-note">
          <em>Tilt:</em> "Goals are consequences, not inputs. The curve closes before launch day or the launch day's a problem."
          <br />
          <em>Kit:</em> "Your trailer is two beats too long. I'm not telling you what to cut."
        </div>
      </div>
    </BuildingFrame>
  );
}
