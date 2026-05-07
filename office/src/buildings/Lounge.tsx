import { BuildingFrame } from '../components/BuildingFrame';

export function Lounge({ onBack }: { onBack: () => void }) {
  return (
    <BuildingFrame
      route="lounge"
      eyebrow="no agenda"
      title="The Lounge"
      inhabitants="whoever wanders in"
      vibe="soft. the room without a job. silence is allowed here."
      onBack={onBack}
    >
      <div className="lounge-shell">
        <div className="lounge-room">
          <div className="lounge-couch" aria-hidden>
            <div className="lounge-cushion" />
            <div className="lounge-cushion" />
            <div className="lounge-cushion" />
          </div>
          <div className="lounge-lamp" aria-hidden />
          <div className="lounge-rug" aria-hidden />
        </div>
        <div className="lounge-text">
          <p>Sometimes the work is to not work.</p>
          <p>If you came in here looking for a metric, you came in the wrong door. The Forge is two buildings over. So is the Tower.</p>
          <p className="lounge-quiet">— quiet —</p>
        </div>
      </div>
    </BuildingFrame>
  );
}
