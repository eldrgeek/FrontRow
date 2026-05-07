import { BuildingFrame } from '../components/BuildingFrame';

export function Forum({ onBack }: { onBack: () => void }) {
  return (
    <BuildingFrame
      route="forum"
      eyebrow="round table · all voices"
      title="The Forum"
      inhabitants="rotating · whoever the question needs"
      vibe="round hall, columns, no head of the table."
      onBack={onBack}
    >
      <div className="forum-shell">
        <div className="forum-ring" aria-hidden>
          <div className="forum-pillar" />
          <div className="forum-pillar" />
          <div className="forum-pillar" />
          <div className="forum-pillar" />
          <div className="forum-pillar" />
          <div className="forum-pillar" />
          <div className="forum-table"><span>·</span></div>
        </div>
        <div className="forum-cols">
          <div className="forum-col">
            <h4>shared canon</h4>
            <ul>
              <li>The Wall — curated; new entries require attribution + date</li>
              <li>SOMA-v2.0 — architectural; SOMA-STATE for what actually works</li>
              <li>Voice direction style guide — Pax + Drew</li>
            </ul>
          </div>
          <div className="forum-col">
            <h4>decisions in flight</h4>
            <ul>
              <li>cc-dispatch ↔ pi RPC: warm-context default</li>
              <li>Mac controller as canonical CDC tool (no osascript)</li>
              <li>Memory-file ownership: aggregator-only writers</li>
            </ul>
          </div>
          <div className="forum-col">
            <h4>action queue</h4>
            <ul>
              <li>Cog daemon: end-of-session trace mining</li>
              <li>Cal: weekly per-specialist coaching note</li>
              <li>Locke: threat-model review for new MCPs</li>
            </ul>
          </div>
        </div>
      </div>
    </BuildingFrame>
  );
}
