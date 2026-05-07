import { PERSONAS, CLUSTERS } from '../data/personas';
import type { Persona } from '../data/personas';
import { Desk } from './Desk';
import { useLiveState } from '../hooks/useLiveState';

function byCluster(c: Persona['cluster']) {
  return PERSONAS.filter(p => p.cluster === c);
}

export function Desks() {
  const order: Persona['cluster'][] = ['memory', 'voice', 'security', 'growth', 'support'];
  return (
    <section id="desks" className="room desks">
      <div className="room-head">
        <span className="eyebrow">the floor</span>
        <h2>Desks</h2>
        <p className="room-sub">Each specialist has a desk. Each desk has its own grain.</p>
      </div>
      {order.map(c => (
        <div key={c} className={`cluster cluster-${c}`}>
          <header className="cluster-head">
            <h3>{CLUSTERS[c].label}</h3>
            <span>{CLUSTERS[c].subtitle}</span>
          </header>
          <div className="cluster-grid">
            {byCluster(c).map(p => <Desk key={p.slug} persona={p} />)}
          </div>
        </div>
      ))}
    </section>
  );
}

export function CoffeeShop() {
  return (
    <section id="coffee" className="room coffee">
      <div className="room-head">
        <span className="eyebrow">open seating</span>
        <h2>The Coffee Shop</h2>
        <p className="room-sub">Where pair-programming happens. Casual register. Mike works here.</p>
      </div>
      <div className="coffee-floor">
        <div className="coffee-bar">
          <div className="coffee-bar-label">bar</div>
          <div className="coffee-mug" aria-hidden>☕</div>
          <div className="coffee-mug" aria-hidden>☕</div>
          <div className="coffee-mug" aria-hidden>☕</div>
        </div>
        <div className="coffee-tables">
          {[
            ['Drew', 'Sona', 'mastering pass on the Alene+Jason cut'],
            ['Cog', 'Cal', 'wiring pre-flight into estimation deltas'],
            ['Ren', 'Pax', 'register check on the Pulse copy'],
            ['Tilt', 'Rin', 'comp-set sanity on the Q3 launch'],
          ].map(([a, b, doing], i) => (
            <div key={i} className="coffee-table">
              <div className="coffee-pair"><span>{a}</span><em>+</em><span>{b}</span></div>
              <div className="coffee-doing">{doing}</div>
            </div>
          ))}
          <div className="coffee-table coffee-table-empty">
            <div className="coffee-pair"><span>open</span></div>
            <div className="coffee-doing">pull a chair up</div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function MeetingRoom() {
  return (
    <section id="meeting" className="room meeting">
      <div className="room-head">
        <span className="eyebrow">round table</span>
        <h2>The Meeting Room</h2>
        <p className="room-sub">Multi-specialist gatherings. Decisions in flight.</p>
      </div>
      <div className="meeting-board">
        <div className="meeting-col">
          <h4>shared canon</h4>
          <ul>
            <li>The Wall — curated; new entries require attribution + date</li>
            <li>SOMA-v2.0 — architectural; SOMA-STATE for what actually works</li>
            <li>Voice direction style guide — Pax + Drew</li>
          </ul>
        </div>
        <div className="meeting-col">
          <h4>decisions in flight</h4>
          <ul>
            <li>cc-dispatch ↔ pi RPC: the warm-context default</li>
            <li>Mac controller as the canonical CDC tool (no osascript keystroke)</li>
            <li>Memory file ownership: aggregator-only writers</li>
          </ul>
        </div>
        <div className="meeting-col">
          <h4>action queue</h4>
          <ul>
            <li>Cog daemon: end-of-session trace mining</li>
            <li>Cal: weekly per-specialist coaching note</li>
            <li>Locke: threat-model review for new MCPs</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

export function OrchestratorHub() {
  const live = useLiveState();
  return (
    <section id="hub" className="room hub">
      <div className="room-head">
        <span className="eyebrow">elevated view</span>
        <h2>Dee's Hub</h2>
        <p className="room-sub">Not a throne — a tower. All workers visible at once.</p>
      </div>
      <div className="hub-grid">
        <div className="hub-card hub-status">
          <div className="hub-card-eyebrow">live state</div>
          <div className={`hub-pill ${live.online ? 'on' : 'off'}`}>
            {live.online ? 'on-air via Yeshie relay' : 'off-air · static view'}
          </div>
          <div className="hub-fineprint">
            polling <code>localhost:3333</code> · graceful fallback when relay sleeps
          </div>
        </div>
        <div className="hub-card">
          <div className="hub-card-eyebrow">routing pattern board</div>
          <ul className="hub-routes">
            <li><strong>warm context · multi-turn →</strong> cc-dispatch</li>
            <li><strong>fire-and-forget completion →</strong> cc hud-ask</li>
            <li><strong>cross-surface (CM/CW → Mac/VPS) →</strong> [DISPATCH:&lt;target&gt;] email</li>
            <li><strong>local primitive (already on Mac) →</strong> direct cc-dispatch shell</li>
          </ul>
        </div>
        <div className="hub-card">
          <div className="hub-card-eyebrow">action queue</div>
          <ol className="hub-queue">
            <li><span>·</span> review SOMA-STATE drift vs latest audits</li>
            <li><span>·</span> Cog: extract patterns from last night's traces</li>
            <li><span>·</span> Cal: log estimate ↔ actual on closed work</li>
            <li><span>·</span> Locke: pre-merge sweep of dispatch routes</li>
          </ol>
        </div>
        <div className="hub-card">
          <div className="hub-card-eyebrow">briefings</div>
          <p className="hub-brief">Morning briefing lands at 06:30 local. Cog rolls up the week's mined patterns; Cal posts the calibration trend; Mae flags any backer thread that needs Mike's eye.</p>
        </div>
      </div>
    </section>
  );
}

export function MikesDesk() {
  return (
    <section id="mike" className="room mike-desk">
      <div className="room-head">
        <span className="eyebrow">human counterpart</span>
        <h2>Mike's Desk</h2>
        <p className="room-sub">A peer desk with a different role. Not better, not worse.</p>
      </div>
      <div className="mike-grid">
        <div className="mike-card mike-brief">
          <h4>this morning's briefing</h4>
          <p className="mike-quote">All my dreams are coming true. Not aspiration; observation.</p>
          <ul>
            <li>Overnight: office shipped (this surface). Lighthouse-clean static.</li>
            <li>On your court: NBARPA × Greg Foster — repo consolidation call.</li>
            <li>SAA85: master show bible review pending.</li>
          </ul>
        </div>
        <div className="mike-card">
          <h4>open on your court</h4>
          <ul>
            <li>Read the Wall. Mark anything that wants editing.</li>
            <li>Eyeball this office. Where does it feel right? Where does it feel staged?</li>
            <li>Approve color palette or push back.</li>
          </ul>
        </div>
        <div className="mike-card">
          <h4>what you're pulling at</h4>
          <ul>
            <li>silicon-children frame — making the substrate visible</li>
            <li>cross-surface dispatch — universal channel</li>
            <li>SOMA v2.0 — what the architecture wants to become</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
