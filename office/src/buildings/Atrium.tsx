import { BuildingFrame } from '../components/BuildingFrame';
import { PERSONAS, CLUSTERS } from '../data/personas';
import type { ClusterKey, Persona } from '../data/personas';

const FLEET_CLUSTERS: ClusterKey[] = [
  'orchestrator', 'memory', 'forge', 'strategy',
  'security', 'craft', 'care', 'growth', 'voice', 'comms',
];

function OrgNode({ persona }: { persona: Persona }) {
  return (
    <div className="org-node" style={{ ['--node-accent' as string]: persona.accent }}>
      <span className="org-node-glyph">{persona.glyph}</span>
      <span className="org-node-name">{persona.name}</span>
      <span className="org-node-domain">{persona.domain}</span>
    </div>
  );
}

export function Atrium({ onBack }: { onBack: () => void }) {
  const dee = PERSONAS.find(p => p.slug === 'dee')!;
  const fleetPersonas = PERSONAS.filter(p => p.tier === 'fleet' && p.slug !== 'dee');
  const clientPersonas = PERSONAS.filter(p => p.tier === 'client');

  const CLIENT_TARGETS: Record<string, string> = {
    coach: 'Greg Foster / NBARPA',
    cora:  'Greg Foster (chair)',
    penn:  'Mark & James',
    vera:  'Eric Kohner',
    dewey: 'Iris (live class)',
  };

  return (
    <BuildingFrame
      route="atrium"
      eyebrow="team structure · who routes where"
      title="The Atrium"
      inhabitants="the whole team · open to visitors"
      vibe="high-ceilinged center of the campus. the directory lives here."
      onBack={onBack}
    >
      <div className="atrium-shell">
        <div className="atrium-intro">
          The Atrium is the org chart. Dee sits at the top of the DIP (Dispatch → Investigate → Produce) loop.
          Fleet agents receive work via cc-dispatch. Client-facing agents are deployed separately and serve external people.
        </div>

        {/* Top: Dee */}
        <div className="org-tree">
          <div className="org-top">
            <div className="org-node org-node-dee" style={{ ['--node-accent' as string]: dee.accent }}>
              <span className="org-node-glyph">{dee.glyph}</span>
              <span className="org-node-name">{dee.name}</span>
              <span className="org-node-domain">{dee.domain}</span>
              <span className="org-node-note">DIP loop · action queue</span>
            </div>
          </div>

          <div className="org-connector org-connector-down" aria-hidden />

          {/* Fleet clusters */}
          <div className="org-clusters">
            {FLEET_CLUSTERS.map(clusterKey => {
              const members = fleetPersonas.filter(p => p.cluster === clusterKey);
              if (!members.length) return null;
              const clusterMeta = CLUSTERS[clusterKey];
              return (
                <div key={clusterKey} className="org-cluster">
                  <div className="org-cluster-label">
                    <span className="org-cluster-name">{clusterMeta.label}</span>
                    <span className="org-cluster-sub">{clusterMeta.subtitle}</span>
                  </div>
                  <div className="org-cluster-members">
                    {members.map(p => <OrgNode key={p.slug} persona={p} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Client-facing branch */}
        <div className="org-client-section">
          <div className="org-client-header">
            <span className="org-client-label">Client-Facing</span>
            <span className="org-client-sub">deployed separately · not in DIP loop · serve external people</span>
          </div>
          <div className="org-client-grid">
            {clientPersonas.map(p => (
              <div key={p.slug} className="org-client-node" style={{ ['--node-accent' as string]: p.accent }}>
                <div className="org-client-node-head">
                  <span className="org-node-glyph">{p.glyph}</span>
                  <span className="org-node-name">{p.name}</span>
                </div>
                <span className="org-node-domain">{p.domain}</span>
                <span className="org-client-serves">→ {CLIENT_TARGETS[p.slug] ?? 'external'}</span>
                {p.voiceUrl && (
                  <a className="org-client-link" href={p.voiceUrl} target="_blank" rel="noreferrer">
                    visit ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </BuildingFrame>
  );
}
