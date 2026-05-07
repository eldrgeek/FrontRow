import { BuildingFrame } from '../components/BuildingFrame';
import { Desk } from '../components/Desk';
import { PERSONAS } from '../data/personas';

const PLOTS = [
  { name: 'NBARPA backers', tended: '2026-05-06', status: 'thriving' },
  { name: 'SAA85 mailing list', tended: '2026-05-04', status: 'tended' },
  { name: 'AI WTF readers', tended: '2026-05-07', status: 'thriving' },
  { name: 'INTOO SDR alumni', tended: '2026-04-30', status: 'sleeping' },
];

export function Garden({ onBack }: { onBack: () => void }) {
  const mae = PERSONAS.find(p => p.slug === 'mae')!;
  return (
    <BuildingFrame
      route="garden"
      eyebrow="people we keep"
      title="The Garden"
      inhabitants="Mae"
      vibe="open-air plots. each one a community. tended on a schedule."
      onBack={onBack}
    >
      <div className="garden-shell">
        <div className="garden-plots">
          <div className="garden-eyebrow">community plots</div>
          {PLOTS.map((p, i) => (
            <div key={i} className={`garden-plot plot-${p.status}`}>
              <div className="garden-plot-head">
                <strong>{p.name}</strong>
                <span className="garden-status">{p.status}</span>
              </div>
              <div className="garden-tended">last tended {p.tended}</div>
            </div>
          ))}
        </div>
        <div className="garden-aside">
          <p>
            "Warm without performing it. <em>I don't know yet, but here's when I will</em> beats a hedge."
          </p>
          <Desk persona={mae} />
        </div>
      </div>
    </BuildingFrame>
  );
}
