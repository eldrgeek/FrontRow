// ─────────────────────────────────────────────────────────────────────────────
// The House Manager's Desk — the 3D Director's Venue (Mike, 2026-08-31:
// "Rather than a configuration panel, I'd rather have it as a 3D venue with
// tools… and the ability to have a conversation with the AI manager.")
//
// FRT's stage from backstage: the AI House Manager stands on the boards, you
// TALK to her (mic publishes on entry), and the TOOL BELT along the bottom
// opens panels — the director-notes desk (the flat CRUD page, embedded
// same-origin so it shares the provisioned credential) and the session-links
// board, fed live by the manager's data events (topic "manager") whenever she
// saves a note or starts a session.
//
// Auth: ?i=<room invite> joins the manager room; #t=<director invite> is
// stored for the embedded notes desk, then stripped from the URL.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { Room, RoomEvent, RemoteTrack } from 'livekit-client';
import Stage from '../components/Stage';

// Director credential may ride the fragment once — same key the flat page uses.
const hashTok = (location.hash.match(/^#t=(.+)$/) || [])[1];
if (hashTok) {
  localStorage.setItem('soma-director-token', decodeURIComponent(hashTok));
  history.replaceState(null, '', location.pathname + location.search);
}

// ── The House Manager avatar: silver bob, headset, clipboard ────────────────
function ManagerAvatar({ levelRef }: { levelRef: React.MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null!);
  const jaw = useRef<THREE.Mesh>(null!);
  const blink = useRef({ next: 2, until: 0 });
  const leftEye = useRef<THREE.Mesh>(null!);
  const rightEye = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const level = levelRef.current;
    if (jaw.current) jaw.current.rotation.x = THREE.MathUtils.lerp(jaw.current.rotation.x, level * 0.55, 0.5);
    if (group.current) {
      group.current.position.y = 2.05 + Math.sin(t * 1.1) * 0.03 + level * 0.04;
      group.current.rotation.y = Math.sin(t * 0.35) * 0.1 + level * Math.sin(t * 9) * 0.02;
    }
    if (t > blink.current.next) { blink.current.until = t + 0.12; blink.current.next = t + 2 + Math.random() * 2.5; }
    const sy = t < blink.current.until ? 0.08 : 1;
    if (leftEye.current) leftEye.current.scale.y = sy;
    if (rightEye.current) rightEye.current.scale.y = sy;
  });

  const skin = '#d9a06b';
  const hair = '#c9c9d4';
  return (
    <group ref={group} position={[0, 2.05, -8]}>
      <mesh><sphereGeometry args={[0.55, 32, 32]} /><meshStandardMaterial color={skin} roughness={0.7} /></mesh>
      <mesh position={[0, 0.16, -0.06]}>
        <sphereGeometry args={[0.6, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        <meshStandardMaterial color={hair} roughness={0.85} />
      </mesh>
      {/* headset band + mic boom — she is CREW */}
      <mesh position={[0, 0.32, 0]} rotation-z={Math.PI / 2}>
        <torusGeometry args={[0.58, 0.03, 8, 24, Math.PI]} />
        <meshStandardMaterial color="#222630" roughness={0.4} />
      </mesh>
      <mesh position={[0.42, -0.12, 0.3]} rotation-z={-0.7}>
        <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
        <meshStandardMaterial color="#222630" roughness={0.4} />
      </mesh>
      <mesh ref={leftEye} position={[-0.2, 0.08, 0.48]}><sphereGeometry args={[0.075, 16, 16]} /><meshStandardMaterial color="#14100c" /></mesh>
      <mesh ref={rightEye} position={[0.2, 0.08, 0.48]}><sphereGeometry args={[0.075, 16, 16]} /><meshStandardMaterial color="#14100c" /></mesh>
      <group position={[0, -0.28, 0.1]}>
        <mesh ref={jaw} position={[0, 0, 0.18]}><boxGeometry args={[0.34, 0.16, 0.4]} /><meshStandardMaterial color={skin} roughness={0.7} /></mesh>
      </group>
      <mesh position={[0, -0.95, 0]}><capsuleGeometry args={[0.42, 0.7, 8, 16]} /><meshStandardMaterial color="#2f3a4a" roughness={0.8} /></mesh>
      {/* clipboard */}
      <mesh position={[-0.45, -0.85, 0.35]} rotation-x={-0.4} rotation-z={0.2}>
        <boxGeometry args={[0.3, 0.42, 0.03]} />
        <meshStandardMaterial color="#8a6d3b" roughness={0.9} />
      </mesh>
      <Text position={[0, 1.05, 0]} fontSize={0.2} color="#c8a24a" anchorX="center">House Manager · AI</Text>
    </group>
  );
}

type SessionEvent = { room: string; talent: { name: string; theaterPath: string; stagePath: string }[]; hostPath: string; staged?: string[] };

function DirectorVenue() {
  const [status, setStatus] = useState<'idle' | 'joining' | 'live' | 'error'>('idle');
  const [note, setNote] = useState('');
  // Rolling caption log (Mike, 2026-08-31: single-slot captions "popping up
  // and disappearing" while choppy ASR streamed — finals accumulate, the
  // in-flight partial rides below them in italic).
  const [capLines, setCapLines] = useState<{ name: string; text: string }[]>([]);
  const [partial, setPartial] = useState<{ name: string; text: string } | null>(null);
  const [tool, setTool] = useState<'none' | 'notes' | 'sessions'>('none');
  const [sessions, setSessions] = useState<SessionEvent[]>([]);
  const [savedFlash, setSavedFlash] = useState('');
  const levelRef = useRef(0);
  const roomRef = useRef<Room | null>(null);

  async function enter() {
    setStatus('joining');
    try {
      const invite = new URL(location.href).searchParams.get('i') || '';
      if (!invite) throw new Error('missing invite (?i=…)');
      const resp = await fetch('../api/rooms/join', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ invite }),
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}) as any)).error || `join ${resp.status}`);
      const j = await resp.json();
      const room = new Room();
      roomRef.current = room;
      const ctx = new AudioContext();
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant) => {
        if (track.kind !== 'audio') return;
        const el = track.attach(); el.style.display = 'none'; document.body.appendChild(el);
        if (!/manager/i.test(participant.identity)) return;
        const src = ctx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
        const an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
        const buf = new Uint8Array(an.frequencyBinCount);
        const tick = () => {
          an.getByteFrequencyData(buf);
          let sum = 0; for (let i = 2; i < 40; i++) sum += buf[i];
          levelRef.current = Math.min(1, sum / 38 / 110);
          requestAnimationFrame(tick);
        };
        tick();
      });
      room.on(RoomEvent.DataReceived, (payload) => {
        try {
          const m = JSON.parse(new TextDecoder().decode(payload));
          if (m?.type === 'transcript' && m.text) {
            if (m.final) { setPartial(null); setCapLines((ls) => [...ls, { name: m.name || 'Someone', text: m.text }].slice(-3)); }
            else setPartial({ name: m.name || 'Someone', text: m.text });
          }
          if (m?.type === 'manager-event') {
            if (m.kind === 'session-started') { setSessions((s) => [m as SessionEvent, ...s]); setTool('sessions'); }
            if (m.kind === 'note-saved') { setSavedFlash(`Saved: ${m.note?.title || 'note'}`); setTimeout(() => setSavedFlash(''), 4000); }
          }
        } catch {}
      });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setNote(room.canPlaybackAudio ? '' : 'Sound is blocked by the browser — click the page once to enable it.');
        if (!room.canPlaybackAudio) {
          const unlock = () => { room.startAudio().catch(() => {}); document.removeEventListener('click', unlock); };
          document.addEventListener('click', unlock);
        }
      });
      await room.connect(j.wsUrl, j.token);
      // The browser may refuse autoplay of remote audio even after the join
      // click (found live 2026-08-31: captions worked, voice silent).
      // startAudio() ties playback to the gesture; the handler above recovers
      // if the browser still balks.
      await room.startAudio().catch(() => {});
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        await room.localParticipant.publishTrack(mic.getAudioTracks()[0], { name: 'director mic' });
      } catch { setNote('Mic unavailable — she cannot hear you. Allow mic access and reload.'); }
      await ctx.resume();
      setStatus('live');
    } catch (e: any) { setStatus('error'); setNote(e?.message || String(e)); }
  }

  const beltBtn = (label: string, key: 'notes' | 'sessions') => (
    <button onClick={() => setTool(tool === key ? 'none' : key)} style={{
      pointerEvents: 'auto', background: tool === key ? '#c8a24a' : 'rgba(23,25,34,.9)',
      color: tool === key ? '#17140a' : '#e7e7ee', border: '1px solid #2a2d3a', borderRadius: 10,
      padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    }}>{label}</button>
  );

  const origin = location.origin + '/rooms';
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <Canvas camera={{ position: [0, 3.2, 4.5], fov: 55 }} style={{ height: '100%' }}>
        <color attach="background" args={['#0b0b10']} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[4, 8, 4]} intensity={0.8} />
        <spotLight position={[0, 9, -4]} angle={0.5} intensity={2} penumbra={0.6} />
        <Stage config={{ artistName: 'House Manager' }} showState="pre-show" performerOnStage={true} curtainOpen={true} spotlightActive={true} />
        <Text position={[0, 6.6, -11]} fontSize={0.58} color="#c8a24a" anchorX="center">THE HOUSE MANAGER'S DESK</Text>
        <ManagerAvatar levelRef={levelRef} />
        <OrbitControls target={[0, 1.8, -7]} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>

      {/* Tool panels */}
      {tool === 'notes' && (
        <iframe src="../director/" title="Director notes" style={{
          position: 'absolute', top: 16, right: 16, width: 'min(460px, 44vw)', height: 'calc(100% - 120px)',
          border: '1px solid #2a2d3a', borderRadius: 14, background: '#0e0f13', zIndex: 900,
        }} />
      )}
      {tool === 'sessions' && (
        <div style={{
          position: 'absolute', top: 16, right: 16, width: 'min(460px, 44vw)', maxHeight: 'calc(100% - 120px)',
          overflowY: 'auto', border: '1px solid #2a2d3a', borderRadius: 14, background: 'rgba(14,15,19,.96)',
          zIndex: 900, color: '#e7e7ee', font: '14px/1.5 -apple-system, sans-serif', padding: 16,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Sessions</div>
          {!sessions.length && <div style={{ color: '#9a9aab' }}>None yet — ask the House Manager to start one.</div>}
          {sessions.map((s, i) => (
            <div key={i} style={{ border: '1px solid #2a2d3a', borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <div style={{ color: '#9a9aab', fontSize: 12, marginBottom: 6 }}>room {s.room}{s.staged?.length ? ` · staged: ${s.staged.join(', ')}` : ''}</div>
              {s.talent?.map((t) => (
                <div key={t.name} style={{ margin: '4px 0' }}>
                  {t.name}: <a style={{ color: '#c8a24a' }} href={origin + t.theaterPath} target="_blank" rel="noreferrer">theater seat</a>
                  {' · '}<a style={{ color: '#c8a24a' }} href={origin + t.stagePath} target="_blank" rel="noreferrer">plain stage</a>
                </div>
              ))}
              <div style={{ margin: '4px 0' }}>Director seat: <a style={{ color: '#c8a24a' }} href={origin + s.hostPath} target="_blank" rel="noreferrer">join</a></div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom overlay: captions + belt */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 20px 24px', zIndex: 1000,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        color: '#e7e7ee', font: '15px/1.4 -apple-system, sans-serif', pointerEvents: 'none',
      }}>
        {savedFlash && <div style={{ color: '#34d399', fontSize: 13 }}>{savedFlash}</div>}
        {(capLines.length > 0 || partial) && (
          <div style={{
            background: 'rgba(14,15,19,.82)', border: '1px solid #2a2d3a', borderRadius: 10, padding: '8px 14px',
            maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {capLines.map((c, i) => (
              <div key={i}><span style={{ color: '#c8a24a', fontWeight: 600, marginRight: 6 }}>{c.name}</span>{c.text}</div>
            ))}
            {partial && (
              <div style={{ opacity: 0.7, fontStyle: 'italic' }}>
                <span style={{ color: '#c8a24a', fontWeight: 600, marginRight: 6 }}>{partial.name}</span>{partial.text}
              </div>
            )}
          </div>
        )}
        {status === 'live' && (
          <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
            {beltBtn('📋 Notes', 'notes')}
            {beltBtn('🎟 Sessions', 'sessions')}
          </div>
        )}
        {status !== 'live' && (
          <button onClick={enter} disabled={status === 'joining'} style={{
            pointerEvents: 'auto', background: '#c8a24a', color: '#17140a', border: 'none',
            borderRadius: 9, padding: '12px 22px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
          }}>{status === 'joining' ? 'Going backstage…' : 'Go backstage'}</button>
        )}
        {note && <div style={{ color: status === 'error' ? '#ef4444' : '#f59e0b', pointerEvents: 'auto' }}>{note}</div>}
        <div style={{ opacity: 0.55, fontSize: 12 }}>{status === 'live' ? 'Your mic is live — just talk to her. · ' : ''}SOMA Rooms × Front Row — director's venue</div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<DirectorVenue />);
