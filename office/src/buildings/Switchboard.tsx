import { BuildingFrame } from '../components/BuildingFrame';
import { Desk } from '../components/Desk';
import { PERSONAS } from '../data/personas';

const PLATFORMS = [
  'Discord', 'WhatsApp', 'Signal', 'SMS / MMS', 'Email (IMAP/SMTP)',
  'Webhook (generic)', 'Slack', 'Mattermost', 'Telegram', 'Pushover',
  'ntfy.sh', 'Kanban (GitHub)', 'Notion', 'Airtable', 'RSS → email',
  'LinkedIn (read-only)', 'X/Twitter (read-only)', 'HN API', 'Discord webhook',
  'Calendar (Google)', 'cc-bridge relay', 'Yeshie Extension relay',
];

const ROUTING_LOG = [
  { type: 'dispatch notification', from: 'Dee', to: 'Discord', status: 'delivered' },
  { type: 'backer reply draft',    from: 'Mae', to: 'Email',   status: 'queued' },
  { type: 'forum post alert',      from: 'SOMA-cron', to: 'Pushover', status: 'delivered' },
  { type: 'VPS watchdog ping',     from: 'daemon',    to: 'Discord', status: 'delivered' },
  { type: 'client intake form',    from: 'Greta',     to: 'Email',   status: 'pending' },
];

export function Switchboard({ onBack }: { onBack: () => void }) {
  const herm = PERSONAS.find(p => p.slug === 'hermes')!;
  return (
    <BuildingFrame
      route="switchboard"
      eyebrow="message routing · 22 platforms · fan-out"
      title="The Switchboard"
      inhabitants="Herm"
      vibe="racks of patch cables, platform logos on screens, always in transit."
      onBack={onBack}
    >
      <div className="switchboard-shell">
        <div className="sw-platforms" aria-label="Platform rack">
          <div className="sw-eyebrow">platforms Herm routes across</div>
          <div className="sw-platform-grid">
            {PLATFORMS.map((p, i) => (
              <div key={i} className="sw-platform-badge">{p}</div>
            ))}
          </div>
        </div>
        <div className="sw-log" aria-label="Routing log">
          <div className="sw-eyebrow">routing log — recent</div>
          <table className="sw-table">
            <thead>
              <tr><th>type</th><th>from</th><th>to</th><th>status</th></tr>
            </thead>
            <tbody>
              {ROUTING_LOG.map((r, i) => (
                <tr key={i}>
                  <td>{r.type}</td>
                  <td>{r.from}</td>
                  <td>{r.to}</td>
                  <td><span className={`sw-status sw-status-${r.status}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="sw-note">
            Herm carries; does not create. Every message that goes between surfaces passes through here.
            The Hermes agent runs the proxy and fan-out layer.
          </div>
        </div>
        <div className="sw-desk">
          <Desk persona={herm} />
        </div>
      </div>
    </BuildingFrame>
  );
}
