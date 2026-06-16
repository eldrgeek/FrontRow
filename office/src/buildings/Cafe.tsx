import { BuildingFrame } from '../components/BuildingFrame';
import { Desk } from '../components/Desk';
import { PERSONAS } from '../data/personas';

const PAIRS: [string, string, string][] = [
  ['Drew', 'Sona', 'mastering pass on the Alene+Jason cut'],
  ['Tilt', 'Rally', 'platform selection for Q3 campaign'],
  ['Ren', 'Opie', 'long-view framing for Pulse UI'],
  ['Kelp', 'Mae', 'pastoral register — inward vs outward boundary'],
  ['Locke', 'Skip', 'adversarial threat-model alignment'],
];

export function Cafe({ onBack }: { onBack: () => void }) {
  const greta = PERSONAS.find(p => p.slug === 'greta')!;
  return (
    <BuildingFrame
      route="cafe"
      eyebrow="open seating · onboarding · pair-programming"
      title="The Cafe"
      inhabitants="Greta · open seating"
      vibe="round building, warm light, the bar runs along the back wall. Greta greets every first visit."
      onBack={onBack}
    >
      <div className="cafe-shell">
        <div className="cafe-bar">
          <div className="cafe-bar-eyebrow">bar</div>
          <div className="cafe-mugs">
            {Array.from({ length: 7 }).map((_, i) => (
              <span key={i} className="cafe-mug" aria-hidden>☕</span>
            ))}
          </div>
          <div className="cafe-tagline">"Mike works here. So do we."</div>
        </div>
        <div className="cafe-tables">
          <div className="cafe-tables-eyebrow">tables — current pairs</div>
          <div className="cafe-grid">
            {PAIRS.map(([a, b, doing], i) => (
              <div key={i} className="cafe-table">
                <div className="cafe-pair"><span>{a}</span><em>+</em><span>{b}</span></div>
                <div className="cafe-doing">{doing}</div>
              </div>
            ))}
            <div className="cafe-table cafe-empty">
              <div className="cafe-pair"><span>open seat</span></div>
              <div className="cafe-doing">pull a chair up</div>
            </div>
          </div>
        </div>
        <div className="cafe-greeter">
          <div className="cafe-eyebrow">at the door</div>
          <Desk persona={greta} />
        </div>
      </div>
    </BuildingFrame>
  );
}
