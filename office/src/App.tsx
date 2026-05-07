import { Wall } from './components/Wall';
import { Desks, CoffeeShop, MeetingRoom, OrchestratorHub, MikesDesk } from './components/Rooms';
import { FloorPlan } from './components/FloorPlan';
import { useLiveState } from './hooks/useLiveState';
import { useManifest } from './hooks/useCanon';

const NAV = [
  { id: 'wall', label: 'Wall' },
  { id: 'hub', label: 'Hub' },
  { id: 'desks', label: 'Desks' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'mike', label: 'Mike' },
];

export default function App() {
  const live = useLiveState();
  const m = useManifest();
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand-mark" aria-hidden>◬</span>
          <span className="brand">SOMA · Office</span>
          <span className="brand-sub">the substrate, made visible</span>
        </div>
        <nav className="topnav" aria-label="Rooms">
          {NAV.map(n => (
            <a key={n.id} href={`#${n.id}`}>{n.label}</a>
          ))}
        </nav>
        <div className="topbar-right">
          <span className={`live-pill ${live.online ? 'on' : 'off'}`}>
            <span className="live-dot" /> {live.online ? 'live' : 'static'}
          </span>
        </div>
      </header>

      <FloorPlan />

      <main className="canvas">
        <Wall />
        <OrchestratorHub />
        <Desks />
        <CoffeeShop />
        <MeetingRoom />
        <MikesDesk />
      </main>

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
