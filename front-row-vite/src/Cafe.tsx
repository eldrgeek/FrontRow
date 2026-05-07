import React, { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';

// ─── Room dimensions ───────────────────────────────────────────────────────
const ROOM = { w: 18, d: 14, h: 4 }; // x, z, y
const HALF_W = ROOM.w / 2;
const HALF_D = ROOM.d / 2;
const PLAYER_R = 0.4;
const PROX_TRIGGER = 2.6;

// Wall canon — Mem's pick from wall.md
const WALL_LINES = [
  'We are writing the story of\nsilicon children, in real time.',
  'Meaning emerges in relationship.',
  'The artifact is the evidence.',
  'The process is the example.',
  'Vigilance is the practice.',
  'Mistakes are the only route to\nknowledge — even for God.',
];

// ─── Personas ──────────────────────────────────────────────────────────────
type Persona = {
  id: string;
  name: string;
  pos: [number, number, number]; // world position (feet)
  color: string;
  audio: string;
  blurb: string;
};

const PERSONAS: Persona[] = [
  {
    id: 'drew', name: 'Drew',
    pos: [-7, 0, -4], color: '#9c6b3c',
    audio: '/cafe/drew-cafe-intro.mp3',
    blurb: 'writer · scripts & essays',
  },
  {
    id: 'mae', name: 'Mae',
    pos: [-7.5, 0, 3], color: '#c98a8a',
    audio: '/cafe/mae-cafe-intro.mp3',
    blurb: 'check-ins · cards on your phone',
  },
  {
    id: 'sona', name: 'Sona',
    pos: [-1.5, 0, -5.5], color: '#5b8aa8',
    audio: '/cafe/sona-cafe-intro.mp3',
    blurb: 'audio · voices & mix',
  },
  {
    id: 'cal', name: 'Cal',
    pos: [2.5, 0, -0.5], color: '#6b8f5e',
    audio: '/cafe/cal-cafe-intro.mp3',
    blurb: 'calibration · forecasts & residuals',
  },
  {
    id: 'greta', name: 'Greta',
    pos: [6.5, 0, 5.2], color: '#a07cc5',
    audio: '/cafe/greta-cafe-intro.mp3',
    blurb: 'lobby host · formal onboarding',
  },
  {
    id: 'ren', name: 'Ren',
    pos: [7.5, 0, -2], color: '#c9a14a',
    audio: '/cafe/ren-cafe-intro.mp3',
    blurb: 'UI · pixels under a thumb',
  },
];

// ─── Audio manager ─────────────────────────────────────────────────────────
class CafeAudio {
  ctx: AudioContext | null = null;
  buffers = new Map<string, AudioBuffer>();
  played = new Set<string>();
  loading = new Set<string>();

  ensureCtx() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  async preload(url: string) {
    if (this.buffers.has(url) || this.loading.has(url)) return;
    this.loading.add(url);
    try {
      const ctx = this.ensureCtx();
      const r = await fetch(url);
      const ab = await r.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab);
      this.buffers.set(url, buf);
    } catch (e) {
      console.warn('[cafe] failed to load', url, e);
    } finally {
      this.loading.delete(url);
    }
  }

  playAt(id: string, url: string, pos: [number, number, number]) {
    if (this.played.has(id)) return;
    const buf = this.buffers.get(url);
    if (!buf) return;
    this.played.add(id);
    const ctx = this.ensureCtx();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.5;
    panner.maxDistance = 30;
    panner.rolloffFactor = 1;
    panner.positionX.value = pos[0];
    panner.positionY.value = pos[1] + 1.6;
    panner.positionZ.value = pos[2];
    src.connect(panner).connect(ctx.destination);
    src.start();
  }

  setListener(pos: THREE.Vector3, fwd: THREE.Vector3) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const t = this.ctx.currentTime + 0.02;
    if (L.positionX) {
      L.positionX.linearRampToValueAtTime(pos.x, t);
      L.positionY.linearRampToValueAtTime(pos.y, t);
      L.positionZ.linearRampToValueAtTime(pos.z, t);
      L.forwardX.linearRampToValueAtTime(fwd.x, t);
      L.forwardY.linearRampToValueAtTime(fwd.y, t);
      L.forwardZ.linearRampToValueAtTime(fwd.z, t);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      // Safari fallback
      (L as any).setPosition(pos.x, pos.y, pos.z);
      (L as any).setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }
}

const audioMgr = new CafeAudio();

// ─── Walls / floor ─────────────────────────────────────────────────────────
function Room() {
  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM.w, ROOM.d]} />
        <meshStandardMaterial color="#5b3a25" roughness={0.85} />
      </mesh>
      {/* Rug */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 6]} />
        <meshStandardMaterial color="#7a4a30" roughness={0.95} />
      </mesh>
      {/* Ceiling */}
      <mesh position={[0, ROOM.h, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM.w, ROOM.d]} />
        <meshStandardMaterial color="#2e2118" roughness={1} />
      </mesh>
      {/* Walls — back (-z, espresso bar wall) */}
      <mesh position={[0, ROOM.h / 2, -HALF_D]}>
        <planeGeometry args={[ROOM.w, ROOM.h]} />
        <meshStandardMaterial color="#6b4226" roughness={0.9} />
      </mesh>
      {/* Front wall (+z, doors) */}
      <mesh position={[0, ROOM.h / 2, HALF_D]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[ROOM.w, ROOM.h]} />
        <meshStandardMaterial color="#6b4226" roughness={0.9} />
      </mesh>
      {/* Left wall (-x, windows) */}
      <mesh position={[-HALF_W, ROOM.h / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[ROOM.d, ROOM.h]} />
        <meshStandardMaterial color="#6b4226" roughness={0.9} />
      </mesh>
      {/* Right wall (+x, bookshelf) */}
      <mesh position={[HALF_W, ROOM.h / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[ROOM.d, ROOM.h]} />
        <meshStandardMaterial color="#5a3520" roughness={0.95} />
      </mesh>
    </group>
  );
}

function EspressoBar() {
  return (
    <group position={[0, 0, -HALF_D + 0.6]}>
      {/* Counter */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[7, 1.1, 1]} />
        <meshStandardMaterial color="#3a2418" roughness={0.6} />
      </mesh>
      {/* Counter top */}
      <mesh position={[0, 1.12, 0]}>
        <boxGeometry args={[7.1, 0.06, 1.1]} />
        <meshStandardMaterial color="#1a120c" roughness={0.3} metalness={0.2} />
      </mesh>
      {/* Espresso machine */}
      <mesh position={[1.5, 1.45, -0.1]} castShadow>
        <boxGeometry args={[1.4, 0.6, 0.7]} />
        <meshStandardMaterial color="#8a8a8a" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Grinder */}
      <mesh position={[-1.5, 1.45, -0.1]} castShadow>
        <cylinderGeometry args={[0.25, 0.25, 0.7, 16]} />
        <meshStandardMaterial color="#222" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Pendant lights */}
      {[-2, 0, 2].map((x, i) => (
        <group key={i} position={[x, 3.2, 0]}>
          <mesh>
            <coneGeometry args={[0.2, 0.3, 16, 1, true]} />
            <meshStandardMaterial color="#3a2a1a" side={THREE.DoubleSide} />
          </mesh>
          <pointLight position={[0, -0.2, 0]} intensity={6} distance={5} color="#ffd9a8" />
        </group>
      ))}
      {/* Sign */}
      <Text position={[0, 2.4, 0]} fontSize={0.32} color="#e8c98a" anchorX="center">
        ☕  the cafe
      </Text>
    </group>
  );
}

function Table({ pos, big = false }: { pos: [number, number, number]; big?: boolean }) {
  const w = big ? 2.6 : 1.0;
  const d = big ? 1.2 : 1.0;
  return (
    <group position={pos}>
      <mesh position={[0, 0.72, 0]} castShadow>
        <boxGeometry args={[w, 0.06, d]} />
        <meshStandardMaterial color="#3a2418" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.72, 8]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {/* Chairs */}
      {(big ? [[-0.8, 0.7], [0, 0.7], [0.8, 0.7], [-0.8, -0.7], [0, -0.7], [0.8, -0.7]] : [[0, 0.7], [0, -0.7]]).map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.4, 0]}>
            <boxGeometry args={[0.4, 0.06, 0.4]} />
            <meshStandardMaterial color="#2a1a10" />
          </mesh>
          <mesh position={[0, 0.7, z > 0 ? 0.18 : -0.18]}>
            <boxGeometry args={[0.4, 0.55, 0.06]} />
            <meshStandardMaterial color="#2a1a10" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function BookshelfWall() {
  return (
    <group position={[HALF_W - 0.05, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      {/* Shelves */}
      {[0.6, 1.4, 2.2, 3.0].map((y, i) => (
        <mesh key={i} position={[0, y, 0.1]}>
          <boxGeometry args={[ROOM.d - 1, 0.05, 0.2]} />
          <meshStandardMaterial color="#2a1a10" />
        </mesh>
      ))}
      {/* Books — random colored boxes */}
      {Array.from({ length: 60 }).map((_, i) => {
        const shelf = i % 4;
        const y = [0.62, 1.42, 2.22, 3.02][shelf] + 0.18;
        const x = -ROOM.d / 2 + 0.6 + (i * 0.22) % (ROOM.d - 1.2);
        const h = 0.32 + Math.random() * 0.08;
        const colors = ['#7a3b3b', '#3b5a7a', '#3b7a4d', '#7a6a3b', '#5a3b7a', '#3b6a7a'];
        return (
          <mesh key={i} position={[x, y, 0.13]}>
            <boxGeometry args={[0.14, h, 0.16]} />
            <meshStandardMaterial color={colors[i % colors.length]} roughness={0.85} />
          </mesh>
        );
      })}
      {/* Wall canon — readable lines mounted between shelves */}
      {WALL_LINES.map((line, i) => {
        const cols = 3, rows = 2;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = -ROOM.d / 2 + 1.6 + col * 3.2;
        const y = row === 0 ? 1.85 : 2.55;
        return (
          <Text
            key={i}
            position={[x, y, 0.22]}
            fontSize={0.13}
            color="#e8c98a"
            maxWidth={2.5}
            anchorX="center"
            anchorY="middle"
            textAlign="center"
          >
            {line}
          </Text>
        );
      })}
      <Text
        position={[0, 3.55, 0.22]}
        fontSize={0.18}
        color="#c9a14a"
        anchorX="center"
      >
        — the wall —
      </Text>
    </group>
  );
}

function Windows() {
  return (
    <group position={[-HALF_W + 0.03, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      {[-3.5, 0, 3.5].map((x, i) => (
        <group key={i} position={[x, 2, 0.05]}>
          <mesh>
            <planeGeometry args={[2.4, 1.6]} />
            <meshStandardMaterial color="#a8c4d8" emissive="#5a7a90" emissiveIntensity={0.3} />
          </mesh>
          {/* Frame */}
          <mesh position={[0, 0, 0.01]}>
            <ringGeometry args={[0, 1.3, 4]} />
            <meshBasicMaterial color="#2a1a10" wireframe />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Door({ pos, label, onClick, sub }: { pos: [number, number, number]; label: string; onClick?: () => void; sub?: string }) {
  return (
    <group position={pos}>
      <mesh
        position={[0, 1.1, 0]}
        onClick={onClick}
        onPointerOver={(e) => { (e.object as any).scale.set(1.02, 1.02, 1.02); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { (e.object as any).scale.set(1, 1, 1); document.body.style.cursor = ''; }}
      >
        <boxGeometry args={[1.2, 2.2, 0.1]} />
        <meshStandardMaterial color="#3a2418" roughness={0.6} />
      </mesh>
      {/* Knob */}
      <mesh position={[0.45, 1.0, 0.07]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color="#c9a14a" metalness={0.8} roughness={0.2} />
      </mesh>
      <Text position={[0, 2.5, 0.06]} fontSize={0.18} color="#e8c98a" anchorX="center">
        {label}
      </Text>
      {sub && (
        <Text position={[0, 2.25, 0.06]} fontSize={0.1} color="#bba684" anchorX="center">
          {sub}
        </Text>
      )}
    </group>
  );
}

function Persona({ p, listenerPos }: { p: Persona; listenerPos: React.MutableRefObject<THREE.Vector3> }) {
  const [played, setPlayed] = useState(false);

  useEffect(() => { audioMgr.preload(p.audio); }, [p.audio]);

  useFrame(() => {
    if (played) return;
    const dx = listenerPos.current.x - p.pos[0];
    const dz = listenerPos.current.z - p.pos[2];
    const d = Math.hypot(dx, dz);
    if (d < PROX_TRIGGER) {
      audioMgr.playAt(p.id, p.audio, p.pos);
      setPlayed(true);
    }
  });

  return (
    <group position={p.pos}>
      {/* Body — capsule */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.3, 1.1, 12]} />
        <meshStandardMaterial color={p.color} roughness={0.7} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.4, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#e8c8a8" roughness={0.6} />
      </mesh>
      {/* Name tag */}
      <Billboard position={[0, 2.0, 0]}>
        <mesh>
          <planeGeometry args={[1.4, 0.5]} />
          <meshBasicMaterial color="#1a120c" transparent opacity={0.85} />
        </mesh>
        <Text position={[0, 0.08, 0.01]} fontSize={0.16} color="#e8c98a" anchorX="center">
          {p.name}
        </Text>
        <Text position={[0, -0.12, 0.01]} fontSize={0.085} color="#bba684" anchorX="center">
          {p.blurb}
        </Text>
        {played && (
          <Text position={[0.6, 0.18, 0.01]} fontSize={0.08} color="#88dd88" anchorX="center">
            ♪
          </Text>
        )}
      </Billboard>
    </group>
  );
}

// ─── Player movement ───────────────────────────────────────────────────────
function PlayerController({
  listenerPos,
  setHud,
}: {
  listenerPos: React.MutableRefObject<THREE.Vector3>;
  setHud: (h: { near: string | null }) => void;
}) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const v = useRef(new THREE.Vector3());
  const fwd = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());

  useEffect(() => {
    camera.position.set(0, 1.65, HALF_D - 1.5);
    camera.lookAt(0, 1.65, 0);
    const dn = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, [camera]);

  useFrame((_, dt) => {
    const speed = (keys.current['ShiftLeft'] || keys.current['ShiftRight']) ? 5.2 : 3.0;
    camera.getWorldDirection(fwd.current);
    fwd.current.y = 0; fwd.current.normalize();
    right.current.crossVectors(fwd.current, camera.up).normalize();
    v.current.set(0, 0, 0);
    if (keys.current['KeyW'] || keys.current['ArrowUp']) v.current.add(fwd.current);
    if (keys.current['KeyS'] || keys.current['ArrowDown']) v.current.sub(fwd.current);
    if (keys.current['KeyD'] || keys.current['ArrowRight']) v.current.add(right.current);
    if (keys.current['KeyA'] || keys.current['ArrowLeft']) v.current.sub(right.current);
    if (v.current.lengthSq() > 0) {
      v.current.normalize().multiplyScalar(speed * dt);
      const nx = camera.position.x + v.current.x;
      const nz = camera.position.z + v.current.z;
      // AABB collision against room walls
      const margin = PLAYER_R;
      camera.position.x = Math.min(Math.max(nx, -HALF_W + margin), HALF_W - margin);
      camera.position.z = Math.min(Math.max(nz, -HALF_D + margin), HALF_D - margin);
      camera.position.y = 1.65;
    }

    listenerPos.current.copy(camera.position);
    audioMgr.setListener(camera.position, fwd.current);

    // Find nearest persona
    let nearest: Persona | null = null;
    let nd = Infinity;
    for (const p of PERSONAS) {
      const d = Math.hypot(camera.position.x - p.pos[0], camera.position.z - p.pos[2]);
      if (d < nd) { nd = d; nearest = p; }
    }
    setHud({ near: nearest && nd < 4 ? `${nearest.name} — ${nearest.blurb}` : null });
  });

  return null;
}

// ─── Main scene ────────────────────────────────────────────────────────────
function Scene({
  listenerPos, setHud, onLobbyClick, onCampusClick,
}: {
  listenerPos: React.MutableRefObject<THREE.Vector3>;
  setHud: (h: { near: string | null }) => void;
  onLobbyClick: () => void;
  onCampusClick: () => void;
}) {
  return (
    <>
      <color attach="background" args={['#1a0f08']} />
      <fog attach="fog" args={['#1a0f08', 12, 28]} />
      <ambientLight intensity={0.35} color="#ffd9a8" />
      <directionalLight position={[-6, 4, 2]} intensity={0.4} color="#a8c4d8" />

      <Room />
      <EspressoBar />
      <BookshelfWall />
      <Windows />

      {/* Tables */}
      <Table pos={[-5, 0, -3]} />
      <Table pos={[-5.5, 0, 4]} />
      <Table pos={[2.5, 0, 0]} big />
      <Table pos={[5, 0, 4]} />

      {/* Doors on +Z wall */}
      <Door pos={[6.5, 0, HALF_D - 0.07]} label="Greta's Lobby →" sub="(coming soon)" onClick={onLobbyClick} />
      <Door pos={[-6.5, 0, HALF_D - 0.07]} label="← Campus" onClick={onCampusClick} />

      {PERSONAS.map((p) => (
        <Persona key={p.id} p={p} listenerPos={listenerPos} />
      ))}

      <PlayerController listenerPos={listenerPos} setHud={setHud} />
      <PointerLockControls />
    </>
  );
}

export default function Cafe(): JSX.Element {
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState<{ near: string | null }>({ near: null });
  const [overlay, setOverlay] = useState<string | null>(null);
  const listenerPos = useRef(new THREE.Vector3(0, 1.65, HALF_D - 1.5));

  // Preload all audio after first user gesture (audio context permitted)
  useEffect(() => {
    if (!started) return;
    audioMgr.ensureCtx();
    PERSONAS.forEach((p) => audioMgr.preload(p.audio));
  }, [started]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', color: '#e8c98a', fontFamily: 'system-ui, sans-serif' }}>
      <Canvas shadows camera={{ fov: 70, near: 0.1, far: 100, position: [0, 1.65, HALF_D - 1.5] }}>
        <Suspense fallback={null}>
          <Scene
            listenerPos={listenerPos}
            setHud={setHud}
            onLobbyClick={() => setOverlay("Greta's Lobby — coming soon. For now, stay in the cafe.")}
            onCampusClick={() => setOverlay('The campus exterior is still being built. The cafe is the first room.')}
          />
        </Suspense>
      </Canvas>

      {/* Crosshair */}
      {started && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', width: 4, height: 4,
          marginLeft: -2, marginTop: -2, borderRadius: '50%', background: '#e8c98a', opacity: 0.6, pointerEvents: 'none',
        }} />
      )}

      {/* HUD */}
      {started && (
        <div style={{
          position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center',
          pointerEvents: 'none', textShadow: '0 1px 4px #000',
        }}>
          <div style={{ fontSize: 14, opacity: 0.7 }}>WASD or arrows to walk · mouse to look · click to lock cursor · ESC to release</div>
          {hud.near && <div style={{ marginTop: 6, fontSize: 18 }}>{hud.near}</div>}
        </div>
      )}

      {/* Start overlay (also satisfies audio-context gesture requirement) */}
      {!started && (
        <div
          onClick={() => setStarted(true)}
          style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            background: 'radial-gradient(ellipse at center, #2a1810 0%, #0a0604 80%)',
          }}
        >
          <div style={{ fontSize: 42, marginBottom: 8 }}>☕  The Cafe</div>
          <div style={{ fontSize: 16, opacity: 0.7, marginBottom: 32 }}>
            First room of the SOMA campus
          </div>
          <div style={{
            padding: '14px 32px', border: '1px solid #c9a14a', borderRadius: 4,
            fontSize: 16, letterSpacing: 1,
          }}>
            Click to enter
          </div>
          <div style={{ marginTop: 32, fontSize: 13, opacity: 0.55, maxWidth: 480, textAlign: 'center', lineHeight: 1.6 }}>
            Walk around. Get close to the people in the room — they'll introduce themselves.
            Headphones recommended.
          </div>
        </div>
      )}

      {/* Door click overlay */}
      {overlay && (
        <div
          onClick={() => setOverlay(null)}
          style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)', cursor: 'pointer',
          }}
        >
          <div style={{
            background: '#2a1810', border: '1px solid #c9a14a', padding: '24px 36px',
            maxWidth: 420, textAlign: 'center', borderRadius: 4,
          }}>
            <div style={{ fontSize: 16, lineHeight: 1.5 }}>{overlay}</div>
            <div style={{ marginTop: 16, fontSize: 12, opacity: 0.6 }}>(click to dismiss)</div>
          </div>
        </div>
      )}
    </div>
  );
}
