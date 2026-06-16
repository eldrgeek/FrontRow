import { BuildingFrame } from '../components/BuildingFrame';
import { Desk } from '../components/Desk';
import { PERSONAS } from '../data/personas';

const PLOTS = [
  { name: 'NBARPA backers',     tended: '2026-05-06', status: 'thriving' },
  { name: 'SAA85 mailing list', tended: '2026-05-04', status: 'tended' },
  { name: 'AI WTF readers',     tended: '2026-05-07', status: 'thriving' },
  { name: 'INTOO SDR alumni',   tended: '2026-04-30', status: 'sleeping' },
];

export function Garden({ onBack }: { onBack: () => void }) {
  const mae  = PERSONAS.find(p => p.slug === 'mae')!;
  const kelp = PERSONAS.find(p => p.slug === 'kelp')!;
  return (
    <BuildingFrame
      route="garden"
      eyebrow="people we keep"
      title="The Garden"
      inhabitants="Mae · Kelp"
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
          <div className="garden-register">
            <div className="garden-eyebrow" style={{ marginTop: '18px' }}>inward vs outward</div>
            <p className="garden-note-text">
              <strong>Mae</strong> handles the inward register — backer threads, Mike-voice drafts, wellness-adjacent content. Care that goes back to the people who are already inside the circle.
            </p>
            <p className="garden-note-text">
              <strong>Kelp</strong> handles the outward pastoral — letters to a hurting friend or family member, written in Mike's voice. Kelp drafts; Mike approves before anything sends.
            </p>
          </div>
        </div>
        <div className="garden-aside">
          <p>
            "Warm without performing it. <em>I don't know yet, but here's when I will</em> beats a hedge."
          </p>
          <p style={{ marginTop: '10px' }}>
            "Gentle, specific, unpreachy. <em>Acknowledge first, offer — don't prescribe.</em>"
          </p>
          <Desk persona={mae} />
          <Desk persona={kelp} />
        </div>
      </div>
    </BuildingFrame>
  );
}
