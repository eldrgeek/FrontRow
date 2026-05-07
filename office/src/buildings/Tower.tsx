import { BuildingFrame } from '../components/BuildingFrame';
import { Desk } from '../components/Desk';
import { PERSONAS } from '../data/personas';
import { useLiveState } from '../hooks/useLiveState';

export function Tower({ onBack, onPick }: { onBack: () => void; onPick: (r: string) => void }) {
  const live = useLiveState();
  const dee = PERSONAS.find(p => p.slug === 'dee')!;
  return (
    <BuildingFrame
      route="tower"
      eyebrow="elevated view — not a throne"
      title="The Tower"
      inhabitants="Dee"
      vibe="tall narrow building. windows look out over the campus."
      onBack={onBack}
    >
      <div className="tower-shell">
        <aside className="tower-windows" aria-label="Windows on the campus">
          <div className="tower-eyebrow">windows on the campus</div>
          <ul className="tower-list">
            {[
              ['library', 'The Library', 'reading'],
              ['studio',  'The Studio',  'drafting'],
              ['booth',   'The Booth',   'rendering'],
              ['situation','Situation Room','watching'],
              ['workshop','The Workshop','laying out'],
              ['forge',   'The Forge',   'pre-flighting'],
              ['greenhouse','The Greenhouse','growing'],
              ['cafe',    'The Cafe',    'pairing'],
            ].map(([r, label, doing]) => (
              <li key={r}>
                <button className="tower-win" onClick={() => onPick(r)}>
                  <span className="tower-win-label">{label}</span>
                  <span className="tower-win-doing">{doing}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="tower-deck">
          <div className="tower-card tower-status">
            <div className="tower-eyebrow">live state</div>
            <div className={`tower-pill ${live.online ? 'on' : 'off'}`}>
              {live.online ? 'on-air via Yeshie relay' : 'off-air · static view'}
            </div>
            <div className="tower-fineprint">polling <code>localhost:3333</code> · graceful fallback</div>
          </div>
          <div className="tower-card">
            <div className="tower-eyebrow">routing pattern board</div>
            <ul className="tower-routes">
              <li><strong>warm context · multi-turn →</strong> cc-dispatch</li>
              <li><strong>fire-and-forget completion →</strong> cc hud-ask</li>
              <li><strong>cross-surface (CM/CW → Mac/VPS) →</strong> [DISPATCH:&lt;target&gt;] email</li>
              <li><strong>local primitive (already on Mac) →</strong> direct cc-dispatch shell</li>
            </ul>
          </div>
          <div className="tower-card">
            <div className="tower-eyebrow">action queue</div>
            <ol className="tower-queue">
              <li>review SOMA-STATE drift vs latest audits</li>
              <li>Cog: extract patterns from last night's traces</li>
              <li>Cal: log estimate ↔ actual on closed work</li>
              <li>Locke: pre-merge sweep of dispatch routes</li>
              <li>Mae: backer thread that pinged twice</li>
            </ol>
          </div>
          <div className="tower-card">
            <div className="tower-eyebrow">briefings</div>
            <p>Morning briefing lands at 06:30 local. Cog rolls up the week's mined patterns; Cal posts the calibration trend; Mae flags any backer thread that needs Mike's eye.</p>
          </div>
          <div className="tower-card tower-deskwrap">
            <Desk persona={dee} />
          </div>
        </main>
      </div>
    </BuildingFrame>
  );
}
