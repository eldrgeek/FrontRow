import { BuildingFrame } from '../components/BuildingFrame';
import { Desk } from '../components/Desk';
import { PERSONAS } from '../data/personas';

const PATTERNS = [
  { name: 'osascript-keystroke for notification', count: 3, lesson: 'use cc hud-ask; never osascript' },
  { name: 'duplicating an existing tool',         count: 2, lesson: 'orient before designing — grep first' },
  { name: 'mocking the database in tests',         count: 4, lesson: 'real DB; mocks hide migration drift' },
  { name: '--input-format json with claude -p',    count: 1, lesson: 'use --input-format text' },
];

const ESTIMATES = [
  { task: 'Doc-rendering tool',   est: '2d',  actual: '6d',  delta: '×3.0' },
  { task: 'Rotation UX MVP',      est: '4h',  actual: '14h', delta: '×3.5' },
  { task: 'Workspace trust gate', est: '1d',  actual: '8d',  delta: '×8.0' },
  { task: 'This office build',    est: '3h',  actual: '4h',  delta: '×1.3' },
];

export function Forge({ onBack }: { onBack: () => void }) {
  const cog = PERSONAS.find(p => p.slug === 'cog')!;
  const cal = PERSONAS.find(p => p.slug === 'cal')!;
  return (
    <BuildingFrame
      route="forge"
      eyebrow="process · pattern · pre-flight"
      title="The Forge"
      inhabitants="Cog · Cal"
      vibe="hot. iron rack of catalogued patterns. ledger of estimates vs actuals."
      onBack={onBack}
    >
      <div className="forge-shell">
        <div className="forge-rack" aria-label="Pattern catalog">
          <div className="forge-eyebrow">Cog's catalog · failure patterns</div>
          <ul className="forge-patterns">
            {PATTERNS.map((p, i) => (
              <li key={i} className="forge-pattern">
                <span className="forge-count">×{p.count}</span>
                <div>
                  <strong>{p.name}</strong>
                  <em>{p.lesson}</em>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="forge-ledger" aria-label="Calibration ledger">
          <div className="forge-eyebrow">Cal's ledger · estimate ↔ actual</div>
          <table className="forge-table">
            <thead><tr><th>task</th><th>estimate</th><th>actual</th><th>delta</th></tr></thead>
            <tbody>
              {ESTIMATES.map((e, i) => (
                <tr key={i}>
                  <td>{e.task}</td><td>{e.est}</td><td>{e.actual}</td>
                  <td className={`forge-delta ${e.delta.includes('×1') ? 'good' : 'bad'}`}>{e.delta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="forge-desks">
          <Desk persona={cog} />
          <Desk persona={cal} />
        </div>
      </div>
    </BuildingFrame>
  );
}
