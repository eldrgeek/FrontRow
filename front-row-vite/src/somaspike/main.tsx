// ─────────────────────────────────────────────────────────────────────────────
// SOMA × Front Row — the avatar spike (2026-08-30, Mike's <1hr order).
//
// Proves the whole thesis in one page: FRT's parked R3F theater renders, and a
// persona avatar on ITS stage can be driven live by a SOMA Rooms audio track —
// no server-side video anywhere. V'Izzy publishes only audio (unchanged);
// this client subscribes, runs an AnalyserNode on her track, and animates a
// stylized avatar's jaw/head from the live energy.
//
// Standalone Vite entry: deliberately no FRT App shell / sockets / auth —
// only the scene components (Stage) + livekit-client.
//
// Served same-origin under /rooms/frt-spike/ so the invite-join call is the
// stage page's own relative endpoint. URL: ?i=<signed invite>.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { Room, RoomEvent, RemoteTrack } from 'livekit-client';
import Stage from '../components/Stage';

// ── Izzy avatar: stylized head, jaw + head-bob from live audio energy ────────
function IzzyAvatar({ levelRef }: { levelRef: React.MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null!);
  const jaw = useRef<THREE.Mesh>(null!);
  const blink = useRef({ next: 2, until: 0 });
  const leftEye = useRef<THREE.Mesh>(null!);
  const rightEye = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const level = levelRef.current; // 0..1 speech energy
    // Jaw opens with energy (springy), head bobs subtly while speaking.
    if (jaw.current) jaw.current.rotation.x = THREE.MathUtils.lerp(jaw.current.rotation.x, level * 0.55, 0.5);
    if (group.current) {
      group.current.position.y = 2.05 + Math.sin(t * 1.2) * 0.03 + level * 0.04;
      group.current.rotation.y = Math.sin(t * 0.4) * 0.12 + level * Math.sin(t * 9) * 0.02;
      group.current.rotation.z = level * Math.sin(t * 7) * 0.015;
    }
    // Blinks.
    if (t > blink.current.next) { blink.current.until = t + 0.12; blink.current.next = t + 1.8 + Math.random() * 2.5; }
    const blinking = t < blink.current.until;
    const sy = blinking ? 0.08 : 1;
    if (leftEye.current) leftEye.current.scale.y = sy;
    if (rightEye.current) rightEye.current.scale.y = sy;
  });

  const skin = '#c8874a';
  const hair = '#2b1c14';
  return (
    <group ref={group} position={[0, 2.05, -8]}>
      {/* head */}
      <mesh>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshStandardMaterial color={skin} roughness={0.7} />
      </mesh>
      {/* hair */}
      <mesh position={[0, 0.18, -0.08]}>
        <sphereGeometry args={[0.58, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
        <meshStandardMaterial color={hair} roughness={0.9} />
      </mesh>
      {/* eyes */}
      <mesh ref={leftEye} position={[-0.2, 0.08, 0.48]}>
        <sphereGeometry args={[0.075, 16, 16]} />
        <meshStandardMaterial color="#14100c" />
      </mesh>
      <mesh ref={rightEye} position={[0.2, 0.08, 0.48]}>
        <sphereGeometry args={[0.075, 16, 16]} />
        <meshStandardMaterial color="#14100c" />
      </mesh>
      {/* jaw — hinged at the back so rotation.x opens the mouth */}
      <group position={[0, -0.28, 0.1]}>
        <mesh ref={jaw} position={[0, 0, 0.18]}>
          <boxGeometry args={[0.34, 0.16, 0.4]} />
          <meshStandardMaterial color={skin} roughness={0.7} />
        </mesh>
      </group>
      {/* torso hint */}
      <mesh position={[0, -0.95, 0]}>
        <capsuleGeometry args={[0.42, 0.7, 8, 16]} />
        <meshStandardMaterial color="#7a2f3f" roughness={0.8} />
      </mesh>
      <Text position={[0, 1.05, 0]} fontSize={0.22} color="#c8a24a" anchorX="center">
        Izzy · AI
      </Text>
    </group>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
function SpikeApp() {
  const [status, setStatus] = useState<'idle' | 'joining' | 'live' | 'error'>('idle');
  const [note, setNote] = useState('');
  const [caption, setCaption] = useState('');
  const levelRef = useRef(0);
  const roomRef = useRef<Room | null>(null);

  async function takeSeat() {
    setStatus('joining');
    try {
      const invite = new URL(location.href).searchParams.get('i') || '';
      if (!invite) throw new Error('missing invite (?i=…)');
      const resp = await fetch('../api/rooms/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ invite, name: 'FRT spike seat' }),
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}) as any)).error || `join ${resp.status}`);
      const j = await resp.json();

      const room = new Room();
      roomRef.current = room;
      const ctx = new AudioContext();
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant) => {
        if (track.kind !== 'audio') return;
        const el = track.attach();
        el.style.display = 'none';
        document.body.appendChild(el);
        if (!/izzy/i.test(participant.identity)) return;
        // Analyser on Izzy's live track → levelRef drives the avatar.
        const src = ctx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        const buf = new Uint8Array(an.frequencyBinCount);
        const tick = () => {
          an.getByteFrequencyData(buf);
          let sum = 0;
          for (let i = 2; i < 40; i++) sum += buf[i]; // speech band
          levelRef.current = Math.min(1, sum / 38 / 110);
          requestAnimationFrame(tick);
        };
        tick();
      });
      room.on(RoomEvent.DataReceived, (payload) => {
        try {
          const m = JSON.parse(new TextDecoder().decode(payload));
          if (m?.type === 'transcript' && m.final) setCaption(`${m.name}: ${m.text}`);
        } catch {}
      });
      await room.connect(j.wsUrl, j.token);
      await ctx.resume();
      setStatus('live');
    } catch (e: any) {
      setStatus('error');
      setNote(e?.message || String(e));
    }
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <Canvas camera={{ position: [0, 3.2, 4.5], fov: 55 }} style={{ height: '100%' }}>
        <color attach="background" args={['#0b0b10']} />
        <ambientLight intensity={0.45} />
        <directionalLight position={[4, 8, 4]} intensity={0.9} />
        <spotLight position={[0, 9, -4]} angle={0.5} intensity={2.2} penumbra={0.6} target-position={[0, 1.5, -8]} />
        <Stage
          config={{ artistName: 'Izzy' }}
          showState="live"
          performerOnStage={false}
          curtainOpen={true}
          spotlightActive={true}
        />
        <IzzyAvatar levelRef={levelRef} />
        <OrbitControls target={[0, 1.8, -7]} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>

      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 20px 26px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        color: '#e7e7ee', font: '15px/1.4 -apple-system, sans-serif', pointerEvents: 'none',
      }}>
        {caption && (
          <div style={{ background: 'rgba(14,15,19,.82)', border: '1px solid #2a2d3a', borderRadius: 10, padding: '8px 14px', maxWidth: 680 }}>
            {caption}
          </div>
        )}
        {status !== 'live' && (
          <button
            onClick={takeSeat}
            disabled={status === 'joining'}
            style={{
              pointerEvents: 'auto', background: '#c8a24a', color: '#17140a', border: 'none',
              borderRadius: 9, padding: '12px 22px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
            }}>
            {status === 'joining' ? 'Taking your seat…' : 'Take your seat'}
          </button>
        )}
        {status === 'error' && <div style={{ color: '#ef4444', pointerEvents: 'auto' }}>{note}</div>}
        <div style={{ opacity: 0.55, fontSize: 12 }}>SOMA Rooms × Front Row Theater — live avatar spike</div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<SpikeApp />);
