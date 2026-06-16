import { BuildingFrame } from '../components/BuildingFrame';
import { Desk } from '../components/Desk';
import { PERSONAS } from '../data/personas';

const CLIENT_CONTEXT: Record<string, { serves: string; context: string }> = {
  coach: {
    serves: 'Greg Foster + NBRPA team',
    context: 'AI manager for the Legends Membership site. Triages bugs and feature requests; surfaces to Greg. Never approves anything solo.',
  },
  cora: {
    serves: 'Greg Foster (first-year committee chair)',
    context: 'Committee-leadership thinking partner. First-year-chair orientation. Warm, substantive — speaks in Matilda voice (ElevenLabs).',
  },
  penn: {
    serves: 'Mark & James (Mike\'s friends)',
    context: 'Warm briefer. The real story of what the team is building and why. George voice (ElevenLabs). Warm, honest, never oversells.',
  },
  vera: {
    serves: 'Eric Kohner (playwright)',
    context: 'Companion + living prototype for Eric\'s play "Witness/Projection". Old-school New York mentorship energy — CTI/ORSC-framed.',
  },
  dewey: {
    serves: 'Iris (live class teacher)',
    context: '~150-word research answers for Iris to paraphrase aloud in live class. Speaks to Iris, not to the class — that\'s Iris\'s job.',
  },
};

export function GuestHouse({ onBack }: { onBack: () => void }) {
  const clientPersonas = PERSONAS.filter(p => p.tier === 'client');
  return (
    <BuildingFrame
      route="guesthouse"
      eyebrow="client-facing · deployed personas · external people"
      title="The Guest House"
      inhabitants="Coach · Cora · Penn · Vera · Dewey"
      vibe="professional reception. these personas serve external people, not internal dispatch."
      onBack={onBack}
    >
      <div className="guesthouse-shell">
        <div className="guesthouse-notice">
          <span className="guesthouse-notice-icon">◉</span>
          <p>
            These are <strong>client-facing personas</strong>. They are not DIP-routed, not cc-dispatch targets,
            and not available for internal tasking. They serve specific external people through dedicated deployed interfaces.
          </p>
        </div>
        <div className="guesthouse-personas">
          {clientPersonas.map(p => {
            const ctx = CLIENT_CONTEXT[p.slug];
            return (
              <div key={p.slug} className="guesthouse-persona" style={{ ['--node-accent' as string]: p.accent }}>
                <div className="guesthouse-persona-header">
                  <span className="guesthouse-glyph">{p.glyph}</span>
                  <div>
                    <div className="guesthouse-name">{p.name}</div>
                    <div className="guesthouse-serves">serves: {ctx?.serves}</div>
                  </div>
                  {p.voiceUrl && (
                    <a
                      className="guesthouse-visit-btn"
                      href={p.voiceUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: p.accent, borderColor: p.accent }}
                    >
                      Visit ↗
                    </a>
                  )}
                </div>
                {ctx && <p className="guesthouse-context">{ctx.context}</p>}
                <div className="guesthouse-desk">
                  <Desk persona={p} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </BuildingFrame>
  );
}
