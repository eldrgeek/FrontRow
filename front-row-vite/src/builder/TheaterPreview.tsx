// A live, flat preview of a theater definition: the lobby's doors laid out by
// the kit's rule, and the chosen screen's room with its seats. It redraws from
// the definition alone, so a proposal can be previewed before anyone approves.

import React from 'react';
import { fill, ScreenDefinition, screensInOrder, ShowFill, TheaterDefinition } from '../theater/definition';
import { floorPlan, lobbyLayout } from './layout';

function Door({ s, show, active, changed, onPick }: {
  s: ScreenDefinition; show: ShowFill | null; active: boolean; changed: boolean; onPick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`bp-door${active ? ' active' : ''}${changed ? ' changed' : ''}${s.kind === 'live' ? ' live' : ''}`}
      onClick={onPick}
      data-testid={`bp-door-${s.id}`}
      aria-pressed={active}
    >
      <span className="bp-marquee">
        {s.marquee.map((l, i) => <span key={i} className={i === 1 ? 'big' : ''}>{fill(l, show, s)}</span>)}
      </span>
      <span className="bp-leaves" aria-hidden="true"><i /><i /></span>
      {s.signage ? <span className="bp-sign">{s.signage}</span> : null}
    </button>
  );
}

function Room({ s, show }: { s: ScreenDefinition; show: ShowFill | null }): JSX.Element {
  const plan = s.kind === 'live' && s.seats ? floorPlan(s.seats, s.template) : null;
  const h = plan ? plan.height : 70;
  return (
    <div className="bp-room" data-testid="bp-room">
      <div className="bp-room-head">
        <strong>{fill(s.title, show, s)}</strong>
        <span>{s.template} · {plan && s.seats ? `${s.seats.count} seats, ${plan.arrangement}` : `${s.shelf?.length ?? 0} videos on the shelf`}</span>
      </div>
      <svg viewBox={`0 0 100 ${h}`} role="img" aria-label={`${s.title} floor plan`}>
        {plan ? (
          <>
            <path className="bp-stage" d={`M ${plan.stage.x} ${plan.stage.y} h ${plan.stage.w} a ${plan.stage.w / 2} ${plan.stage.h} 0 0 1 ${-plan.stage.w} 0 z`} />
            {plan.seats.map(([x, y], i) => <circle key={i} className="bp-seat" cx={x} cy={y} r={Math.min(2.2, 60 / (plan.seats.length + 10) + 1)} data-testid="bp-seat" />)}
          </>
        ) : (
          <>
            <rect className="bp-stage" x={25} y={4} width={50} height={8} rx={2} />
            <text x={50} y={40} textAnchor="middle" className="bp-shelf-label">Shelf of videos</text>
          </>
        )}
      </svg>
      <p className="bp-blurb">{fill(s.blurb, show, s)}</p>
    </div>
  );
}

export function TheaterPreview({ def, show, selected, onSelect, changedScreens, previewing }: {
  def: TheaterDefinition;
  show: ShowFill | null;
  selected: string;
  onSelect: (id: string) => void;
  changedScreens: Set<string>;
  previewing: boolean;
}): JSX.Element {
  const screens = screensInOrder(def);
  const layout = lobbyLayout(screens.length);
  const sel = screens.find((s) => s.id === selected) ?? screens[0];
  const p = def.theme.palette;
  const style = {
    '--bp-wall': p.wall,
    '--bp-marquee': p.marquee,
    '--bp-marquee-text': p.marqueeText,
    '--bp-accent': p.accent,
    '--bp-seat': p.seat,
  } as React.CSSProperties;

  return (
    <section className={`bp-preview curtain-${def.theme.curtain}${previewing ? ' previewing' : ''}`} style={style} data-testid="bp-preview" data-layout={layout}>
      {previewing ? <div className="bp-previewing" data-testid="bp-previewing">Previewing a proposed change</div> : null}
      <div className="bp-lobby">
        <div className="bp-lobby-title">{def.name} <small>hosted by {def.hostedBy}</small></div>
        <nav className={`bp-doors ${layout}`} aria-label="Doors" style={{ '--n': screens.length } as React.CSSProperties}>
          {screens.map((s, i) => (
            <div key={s.id} className="bp-door-slot" style={{ '--i': i } as React.CSSProperties}>
              <Door s={s} show={show} active={s.id === sel?.id} changed={changedScreens.has(s.id)} onPick={() => onSelect(s.id)} />
            </div>
          ))}
        </nav>
        <div className="bp-layout-note">{screens.length} {screens.length === 1 ? 'door' : 'doors'}, laid out as {layout === 'row' ? 'a row' : layout === 'arc' ? 'an arc' : 'a corridor'}</div>
      </div>
      {sel ? <Room s={sel} show={show} /> : null}
    </section>
  );
}
