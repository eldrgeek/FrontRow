import { BuildingFrame } from '../components/BuildingFrame';
import { Desk } from '../components/Desk';
import { PERSONAS } from '../data/personas';

export function Workshop({ onBack }: { onBack: () => void }) {
  const ren = PERSONAS.find(p => p.slug === 'ren')!;
  return (
    <BuildingFrame
      route="workshop"
      eyebrow="surfaces Mike looks at"
      title="The Workshop"
      inhabitants="Ren"
      vibe="graph paper everywhere. spec sheets pinned. component shelves."
      onBack={onBack}
    >
      <div className="ws-shell">
        <div className="ws-grid" aria-label="Spec board">
          <div className="ws-eyebrow">layout drafts</div>
          <div className="ws-frames">
            <div className="ws-frame">
              <div className="ws-frame-title">pulse · home</div>
              <div className="ws-wire"><span /><span /><span /></div>
            </div>
            <div className="ws-frame">
              <div className="ws-frame-title">hud · overlay</div>
              <div className="ws-wire ws-wire-vert"><span /><span /></div>
            </div>
            <div className="ws-frame">
              <div className="ws-frame-title">office · campus</div>
              <div className="ws-wire ws-wire-blocks"><span /><span /><span /><span /><span /><span /></div>
            </div>
          </div>
        </div>
        <div className="ws-shelves" aria-label="Component shelves">
          <div className="ws-eyebrow">component shelf</div>
          <ul>
            <li><code>&lt;Card/&gt;</code> · 6 variants</li>
            <li><code>&lt;Pill/&gt;</code> · status + count</li>
            <li><code>&lt;Stele/&gt;</code> · canon display</li>
            <li><code>&lt;Fader/&gt;</code> · audio mix</li>
            <li><code>&lt;Threat/&gt;</code> · severity tag</li>
            <li><code>&lt;BuildingFrame/&gt;</code> · campus shell</li>
          </ul>
        </div>
        <div className="ws-desk">
          <Desk persona={ren} />
        </div>
      </div>
    </BuildingFrame>
  );
}
