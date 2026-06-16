import { BuildingFrame } from '../components/BuildingFrame';
import { Desk } from '../components/Desk';
import { PERSONAS } from '../data/personas';

const THREATS = [
  { sev: 'high',   what: 'mock prompt-injection from email sender list',        status: 'mitigated', who: 'Locke' },
  { sev: 'med',    what: 'cc-bridge MCP token surface — needs rotation policy', status: 'open',      who: 'Locke' },
  { sev: 'med',    what: 'Yeshie relay bind-address audit (was 0.0.0.0)',       status: 'closed',    who: 'Locke' },
  { sev: 'low',    what: 'memory file write race — aggregator-only enforced',   status: 'closed',    who: 'Locke' },
];

const TELEMETRY = [
  { metric: 'dispatch p95',    value: '4.2s',  trend: 'flat' },
  { metric: 'agent uptime',    value: '99.7%', trend: 'up' },
  { metric: 'tool errors / hr', value: '0.4', trend: 'down' },
  { metric: 'queue depth',     value: '3',     trend: 'flat' },
];

export function SituationRoom({ onBack }: { onBack: () => void }) {
  const locke = PERSONAS.find(p => p.slug === 'locke')!;
  return (
    <BuildingFrame
      route="situation"
      eyebrow="trust boundaries · threat models"
      title="The Situation Room"
      inhabitants="Locke"
      vibe="dim room, walls of telemetry, severity ranks on the threat board"
      onBack={onBack}
    >
      <div className="sit-shell">
        <div className="sit-board" aria-label="Threat board">
          <div className="sit-eyebrow">threat board</div>
          <table className="sit-table">
            <thead>
              <tr><th>sev</th><th>finding</th><th>status</th><th>owner</th></tr>
            </thead>
            <tbody>
              {THREATS.map((t, i) => (
                <tr key={i}>
                  <td><span className={`sev sev-${t.sev}`}>{t.sev}</span></td>
                  <td>{t.what}</td>
                  <td><span className={`stat stat-${t.status}`}>{t.status}</span></td>
                  <td>{t.who}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sit-telemetry" aria-label="Telemetry wall">
          <div className="sit-eyebrow">telemetry wall — Locke's monitoring view</div>
          <div className="sit-metrics">
            {TELEMETRY.map(t => (
              <div key={t.metric} className="sit-metric">
                <div className="sit-metric-value">{t.value}</div>
                <div className="sit-metric-label">{t.metric}</div>
                <div className={`sit-metric-trend trend-${t.trend}`}>{t.trend}</div>
              </div>
            ))}
          </div>
          <div className="sit-strip" aria-hidden>
            {Array.from({ length: 40 }).map((_, i) => (
              <span key={i} style={{ height: `${20 + ((i * 13) % 60)}%` }} />
            ))}
          </div>
        </div>
        <div className="sit-desks sit-desks-solo">
          <Desk persona={locke} />
        </div>
      </div>
    </BuildingFrame>
  );
}
