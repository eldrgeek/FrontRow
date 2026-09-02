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
  // Captions render PARTIALS live and update in place (Mike, 2026-08-30:
  // final-only captions trailed speech by seconds and misrepresented what
  // Izzy was actually hearing in real time).
  const [caption, setCaption] = useState<{ name: string; text: string; final: boolean } | null>(null);
  const [camOn, setCamOn] = useState(false);
  const levelRef = useRef(0);
  const roomRef = useRef<Room | null>(null);
  const inviteRef = useRef('');
  const camStreamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const uploadChain = useRef<Promise<any>>(Promise.resolve());
  const selfviewRef = useRef<HTMLVideoElement>(null);

  // Camera + self-recording, ported from the green-room stage page (Mike,
  // 2026-08-30: "we've lost the ability to render and record video" — the
  // spike never had it). Publishes the camera to the room AND streams webm
  // slices of cam+mic to the invite-authed /api/rooms/video appender.
  async function toggleCam() {
    const room = roomRef.current;
    if (!room) return;
    if (camOn) {
      try { recRef.current?.stop(); } catch {}
      recRef.current = null;
      camStreamRef.current?.getTracks().forEach((t) => {
        room.localParticipant.unpublishTrack(t).catch(() => {});
        t.stop();
      });
      camStreamRef.current = null;
      setCamOn(false);
      return;
    }
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: true });
      camStreamRef.current = cam;
      const vTrack = cam.getVideoTracks()[0];
      await room.localParticipant.publishTrack(vTrack, { name: 'camera' });
      if (selfviewRef.current) selfviewRef.current.srcObject = new MediaStream([vTrack]);
      const recTracks: MediaStreamTrack[] = [vTrack];
      for (const pub of room.localParticipant.trackPublications.values()) {
        const t = (pub as any).track?.mediaStreamTrack;
        if (t && t.kind === 'audio') recTracks.push(t);
      }
      const rec = new MediaRecorder(new MediaStream(recTracks), { mimeType: 'video/webm', videoBitsPerSecond: 1_200_000 });
      rec.ondataavailable = (e) => {
        if (!e.data?.size) return;
        const blob = e.data;
        uploadChain.current = uploadChain.current.then(() =>
          fetch(`../api/rooms/video?i=${encodeURIComponent(inviteRef.current)}`, { method: 'POST', body: blob }).catch(() => {})
        );
      };
      rec.start(5000);
      recRef.current = rec;
      setCamOn(true);
    } catch {
      setNote('Camera unavailable — check permissions.');
    }
  }

  async function takeSeat() {
    setStatus('joining');
    try {
      let invite = new URL(location.href).searchParams.get('i') || '';
      if (!invite) {
        const m = location.pathname.match(/\/go\/([A-Za-z0-9_-]+)/);
        if (m) {
          const r = await fetch('../api/rooms/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: m[1] }) });
          if (r.ok) invite = (await r.json()).invite;
        }
      }
      inviteRef.current = invite;
      if (!invite) throw new Error('missing or expired link — ask for a fresh one');
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
          if (m?.type === 'transcript' && m.text) setCaption({ name: m.name || 'Someone', text: m.text, final: !!m.final });
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
      // PUBLISH THE MIC — the seat must speak, not only listen. (First live
      // test, 2026-08-30: Mike talked to a page that never published audio;
      // Izzy heard silence. The green-room stage page always did this.)
      // Mic denial must NOT strand a connected seat: degrade to listen-only
      // with a visible note instead of an error state (found in verification,
      // 2026-08-30 — the room was live while the page said Permission denied).
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        await room.localParticipant.publishTrack(mic.getAudioTracks()[0], { name: j.displayName || 'seat mic' });
      } catch {
        setNote('Mic unavailable — you can hear Izzy but she cannot hear you. Allow mic access and reload to talk.');
      }
      (window as any).somaRoom = room; // debug/verification handle
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
        {/* performerOnStage=true HIDES CurvedScreen/YouTubeScreen — that
            component mounts a DOM iframe layer over the whole canvas that
            both buries our UI overlay and plays FRT's fallback reel
            (found live 2026-08-30: "Jess in the background"). */}
        <Stage
          config={{ artistName: 'Izzy' }}
          showState="live"
          performerOnStage={true}
          curtainOpen={true}
          spotlightActive={true}
        />
        <Text position={[0, 6.6, -11]} fontSize={0.62} color="#c8a24a" anchorX="center">
          SOMA ROOMS × FRONT ROW
        </Text>
        <IzzyAvatar levelRef={levelRef} />
        <OrbitControls target={[0, 1.8, -7]} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>

      {/* dressing-room mirror: your own camera, top-right */}
      <video
        ref={selfviewRef}
        autoPlay muted playsInline
        style={{
          position: 'absolute', top: 14, right: 14, width: 200, borderRadius: 12,
          border: '1px solid #2a2d3a', background: '#000', zIndex: 1000,
          display: camOn ? 'block' : 'none',
        }}
      />

      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 20px 26px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, zIndex: 1000,
        color: '#e7e7ee', font: '15px/1.4 -apple-system, sans-serif', pointerEvents: 'none',
      }}>
        {caption && (
          <div style={{
            background: 'rgba(14,15,19,.82)', border: '1px solid #2a2d3a', borderRadius: 10,
            padding: '8px 14px', maxWidth: 680,
            opacity: caption.final ? 1 : 0.75, fontStyle: caption.final ? 'normal' : 'italic',
          }}>
            <span style={{ color: '#c8a24a', fontWeight: 600, marginRight: 6 }}>{caption.name}</span>
            {caption.text}
          </div>
        )}
        {status === 'live' && (
          <button
            onClick={toggleCam}
            style={{
              pointerEvents: 'auto', background: 'transparent', color: '#e7e7ee',
              border: '1px solid #2a2d3a', borderRadius: 9, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
            }}>
            {camOn ? '● Recording — turn camera off' : 'Turn on camera (records you)'}
          </button>
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
        {note && <div style={{ color: status === 'error' ? '#ef4444' : '#f59e0b', pointerEvents: 'auto' }}>{note}</div>}
        <div style={{ opacity: 0.55, fontSize: 12 }}>
          {status === 'live' && !note ? 'Your mic is live — just talk to her. · ' : ''}SOMA Rooms × Front Row Theater — live avatar spike
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<SpikeApp />);
