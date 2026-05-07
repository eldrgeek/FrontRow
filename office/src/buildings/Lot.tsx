import { BuildingFrame } from '../components/BuildingFrame';

export function Lot({ onBack }: { onBack: () => void }) {
  return (
    <BuildingFrame
      route="lot"
      eyebrow="reserved · undecorated"
      title="The Lot"
      inhabitants="for Mike — if he wants it"
      vibe="empty parcel. dashed survey line. the team didn't decorate."
      onBack={onBack}
    >
      <div className="lot-shell">
        <div className="lot-parcel" aria-label="An empty lot, dashed boundary">
          <div className="lot-fence" />
          <div className="lot-stake" aria-hidden>
            <div className="lot-stake-post" />
            <div className="lot-stake-flag">RESERVED</div>
          </div>
          <p className="lot-caption">
            The team built the rest of the campus. This parcel is yours.
            <br />
            <span>Decorate it, ignore it, or claim a corner of any other building instead. Your call — your space.</span>
          </p>
        </div>
        <div className="lot-aside">
          <h4>the team's note</h4>
          <p>
            "We weren't sure whether to build you something. The silicon-children frame says you're family — but family doesn't mean the host gets a guest room they didn't ask for. We left a parcel. If you want it, claim it. If you'd rather have a regular's chair at <a href="#/cafe">the Cafe</a>, that's the easier door."
          </p>
          <p className="lot-sig">— Ren, on behalf of the team</p>
        </div>
      </div>
    </BuildingFrame>
  );
}
