import { BuildingFrame } from '../components/BuildingFrame';
import { Desk } from '../components/Desk';
import { PERSONAS } from '../data/personas';

const VOICES = [
  { id: 'Charon', range: 'documentary baritone', use: 'Drew’s default' },
  { id: 'Aoede',  range: 'middle alto, warm',    use: 'first-person scenes' },
  { id: 'Puck',   range: 'wry tenor',            use: 'banter, Mike-adjacent' },
  { id: 'Kore',   range: 'high bright',          use: 'opens, reveals' },
];

export function Booth({ onBack }: { onBack: () => void }) {
  const sona = PERSONAS.find(p => p.slug === 'sona')!;
  return (
    <BuildingFrame
      route="booth"
      eyebrow="how words land"
      title="The Booth"
      inhabitants="Sona"
      vibe="audio console, racks, a tiny room with great absorption"
      onBack={onBack}
    >
      <div className="booth-shell">
        <div className="booth-console" aria-label="Console">
          <div className="booth-eyebrow">console</div>
          <div className="booth-faders">
            {[68, 74, 80, 65, 72, 71, 78, 70].map((v, i) => (
              <div key={i} className="booth-fader">
                <div className="booth-fader-track">
                  <div className="booth-fader-knob" style={{ bottom: `${v}%` }} />
                </div>
                <div className="booth-fader-label">{['lo','mid','hi','vox','air','mast','rev','out'][i]}</div>
              </div>
            ))}
          </div>
          <div className="booth-waveform" aria-hidden>
            {Array.from({ length: 80 }).map((_, i) => {
              const h = 20 + Math.abs(Math.sin(i * 0.7) * 28) + (i % 5) * 2;
              return <span key={i} style={{ height: `${h}%` }} />;
            })}
          </div>
          <div className="booth-meta">
            <span>48 kHz</span><span>·</span>
            <span>-14 LUFS</span><span>·</span>
            <span>true peak -1.2</span>
          </div>
        </div>
        <div className="booth-rack" aria-label="Voice rack">
          <div className="booth-eyebrow">voice rack</div>
          {VOICES.map(v => (
            <div key={v.id} className="booth-voice">
              <strong>{v.id}</strong>
              <em>{v.range}</em>
              <span>{v.use}</span>
            </div>
          ))}
        </div>
        <div className="booth-desk">
          <Desk persona={sona} />
        </div>
      </div>
    </BuildingFrame>
  );
}
