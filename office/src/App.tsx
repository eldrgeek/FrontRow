import { useRoute, ROUTE_LABELS } from './hooks/useRoute';
import type { Route } from './hooks/useRoute';
import { Campus } from './components/Campus';
import { Library } from './buildings/Library';
import { Studio } from './buildings/Studio';
import { Booth } from './buildings/Booth';
import { SituationRoom } from './buildings/SituationRoom';
import { Tower } from './buildings/Tower';
import { Workshop } from './buildings/Workshop';
import { Forge } from './buildings/Forge';
import { Greenhouse } from './buildings/Greenhouse';
import { Garden } from './buildings/Garden';
import { Clinic } from './buildings/Clinic';
import { Cafe } from './buildings/Cafe';
import { Forum } from './buildings/Forum';
import { Lounge } from './buildings/Lounge';
import { Lot } from './buildings/Lot';
import { useLiveState } from './hooks/useLiveState';
import { useManifest } from './hooks/useCanon';

export default function App() {
  const [route, go] = useRoute();
  const live = useLiveState();
  const m = useManifest();
  const back = () => go('campus');

  let body;
  switch (route) {
    case 'library':    body = <Library    onBack={back} />; break;
    case 'studio':     body = <Studio     onBack={back} />; break;
    case 'booth':      body = <Booth      onBack={back} />; break;
    case 'situation':  body = <SituationRoom onBack={back} />; break;
    case 'tower':      body = <Tower      onBack={back} onPick={(r) => go(r as Route)} />; break;
    case 'workshop':   body = <Workshop   onBack={back} />; break;
    case 'forge':      body = <Forge      onBack={back} />; break;
    case 'greenhouse': body = <Greenhouse onBack={back} />; break;
    case 'garden':     body = <Garden     onBack={back} />; break;
    case 'clinic':     body = <Clinic     onBack={back} />; break;
    case 'cafe':       body = <Cafe       onBack={back} />; break;
    case 'forum':      body = <Forum      onBack={back} />; break;
    case 'lounge':     body = <Lounge     onBack={back} />; break;
    case 'lot':        body = <Lot        onBack={back} />; break;
    default:           body = <Campus     onPick={go} />;
  }

  return (
    <div className={`app route-${route}`}>
      <header className="topbar">
        <div className="topbar-left">
          <button className="brand-btn" onClick={() => go('campus')} aria-label="Back to campus">
            <span className="brand-mark" aria-hidden>◬</span>
            <span className="brand">SOMA · Campus</span>
          </button>
          <span className="brand-sub">the team's home — Mike's a welcome guest</span>
        </div>
        <div className="topbar-route" aria-live="polite">{ROUTE_LABELS[route]}</div>
        <div className="topbar-right">
          <span className={`live-pill ${live.online ? 'on' : 'off'}`}>
            <span className="live-dot" /> {live.online ? 'live' : 'static'}
          </span>
        </div>
      </header>

      <main className="canvas">{body}</main>

      <footer className="bottombar">
        <span>built by Ren — for the team, with the team</span>
        <span className="dot">·</span>
        <span>{m ? `${m.personas.length} persona files synced · wall ${m.wall.bytes}B` : 'syncing canon…'}</span>
        <span className="dot">·</span>
        <span><a href="https://github.com/eldrgeek/FrontRow" target="_blank" rel="noreferrer">eldrgeek/FrontRow</a></span>
      </footer>
    </div>
  );
}
