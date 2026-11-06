// House lights that dim when the show goes live and come back up after it.
// `level` 1 = house lights up, ~0.15 = show; intensities ease toward it.
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function HouseLights({ level }: { level: number }): JSX.Element {
  const hemi = useRef<THREE.HemisphereLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const pt = useRef<THREE.PointLight>(null);
  const dir = useRef<THREE.DirectionalLight>(null);
  const cur = useRef(level);
  useFrame((_, delta) => {
    cur.current += (level - cur.current) * Math.min(1, delta * 1.2);
    const k = cur.current;
    if (hemi.current) hemi.current.intensity = 0.7 * k;
    if (amb.current) amb.current.intensity = 0.08 + 0.27 * k;
    if (pt.current) pt.current.intensity = 0.6 * k;
    if (dir.current) dir.current.intensity = 0.5 * k;
  });
  return (
    <>
      {/* All local: the old drei "city" preset fetched an HDR from a CDN, and
          the theater failed to load without it. */}
      <hemisphereLight ref={hemi} args={['#ffe2b8', '#2a0812', 0.7]} />
      <ambientLight ref={amb} intensity={0.35} />
      <pointLight ref={pt} position={[10, 10, 10]} intensity={0.6} color="#ffd9a0" />
      <directionalLight ref={dir} position={[0, 12, 8]} intensity={0.5} color="#fff1d6" />
    </>
  );
}

export default HouseLights;
