import { BuildingFrame } from '../components/BuildingFrame';
import { Desk } from '../components/Desk';
import { PERSONAS } from '../data/personas';

export function Clinic({ onBack }: { onBack: () => void }) {
  const vee = PERSONAS.find(p => p.slug === 'vee')!;
  return (
    <BuildingFrame
      route="clinic"
      eyebrow="patient flow · plain language"
      title="The Clinic"
      inhabitants="Vee"
      vibe="white walls, soft lighting, a chair that is comfortable to wait in."
      onBack={onBack}
    >
      <div className="clinic-shell">
        <div className="clinic-room">
          <div className="clinic-eyebrow">today's intake</div>
          <ul className="clinic-list">
            <li>Patient portal copy review — sign-in flow</li>
            <li>Medication-list page — plain language pass</li>
            <li>Pre-visit checklist — accessibility audit</li>
          </ul>
          <p className="clinic-quote">
            "Plain. Specific. I won't hide behind jargon when someone is scared."
          </p>
        </div>
        <div className="clinic-desk">
          <Desk persona={vee} />
        </div>
      </div>
    </BuildingFrame>
  );
}
