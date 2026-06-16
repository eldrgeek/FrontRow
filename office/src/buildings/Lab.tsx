import { BuildingFrame } from '../components/BuildingFrame';
import { Desk } from '../components/Desk';
import { PERSONAS } from '../data/personas';

const RECIPES = [
  {
    name: 'legends-membership login',
    target: '#email-input → #password-input → [data-action=submit]',
    status: 'stable',
    healed: 0,
  },
  {
    name: 'SOMA-audit upload to Drive',
    target: '#file-picker → .upload-btn',
    status: 'stable',
    healed: 1,
  },
  {
    name: 'Substack publish flow',
    target: '.publish-dropdown → [role=menuitem]:nth(1)',
    status: 'fragile',
    healed: 3,
  },
  {
    name: 'GitHub PR review approve',
    target: '.review-changes-btn → #approve-radio → .submit-review',
    status: 'stable',
    healed: 0,
  },
  {
    name: 'Netlify deploy status poll',
    target: '.deploy-status .status-badge',
    status: 'stable',
    healed: 0,
  },
];

const RESOLUTION_LOG = [
  { recipe: 'Substack publish',    selector: '.draft-save-btn',       fix: 'swapped to .save-draft [data-state=ready]', date: '2026-05-12' },
  { recipe: 'Drive upload',        selector: '#file-input',           fix: 'shadow DOM piercing via evaluate()',         date: '2026-05-03' },
  { recipe: 'Substack publish',    selector: '.publish-now-btn',      fix: 'dropdown structure changed, menu-item index', date: '2026-04-28' },
];

export function Lab({ onBack }: { onBack: () => void }) {
  const yeshie = PERSONAS.find(p => p.slug === 'yeshie')!;
  return (
    <BuildingFrame
      route="lab"
      eyebrow="browser automation · self-healing RPA · soma-guide"
      title="The Lab"
      inhabitants="Yeshie"
      vibe="browser windows on every screen. selector logs. recipe boards. the Yeshie Extension lives here."
      onBack={onBack}
    >
      <div className="lab-shell">
        <div className="lab-recipes" aria-label="Recipe board">
          <div className="lab-eyebrow">recipe board</div>
          <div className="lab-recipe-list">
            {RECIPES.map((r, i) => (
              <div key={i} className={`lab-recipe lab-recipe-${r.status}`}>
                <div className="lab-recipe-head">
                  <strong>{r.name}</strong>
                  <span className={`lab-recipe-badge lab-badge-${r.status}`}>{r.status}</span>
                </div>
                <code className="lab-recipe-target">{r.target}</code>
                {r.healed > 0 && (
                  <span className="lab-recipe-healed">self-healed ×{r.healed}</span>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="lab-resolution" aria-label="Resolution log">
          <div className="lab-eyebrow">resolution log — broken selectors healed</div>
          <table className="lab-table">
            <thead>
              <tr><th>recipe</th><th>old selector</th><th>fix</th><th>date</th></tr>
            </thead>
            <tbody>
              {RESOLUTION_LOG.map((r, i) => (
                <tr key={i}>
                  <td>{r.recipe}</td>
                  <td><code>{r.selector}</code></td>
                  <td>{r.fix}</td>
                  <td>{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="lab-note">
            Yeshie talks in states, targets, payloads, and signatures — not vibes.
            Anti-magic: every automation is inspectable, every heal is logged.
          </div>
        </div>
        <div className="lab-desk">
          <Desk persona={yeshie} />
        </div>
      </div>
    </BuildingFrame>
  );
}
