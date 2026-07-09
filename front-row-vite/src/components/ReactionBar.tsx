import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ReactionBarProps {
  level: number; // 0–100
}

/**
 * ReactionBar — a glowing plane at the front apron edge.
 * Color interpolates from #222 (cold) to #ff6b35 (hot) based on level.
 */
export default function ReactionBar({ level }: ReactionBarProps): JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(() => {
    if (!matRef.current) return;
    const t = Math.max(0, Math.min(1, level / 100));
    const cold = new THREE.Color('#222222');
    const hot = new THREE.Color('#ff6b35');
    matRef.current.color.lerpColors(cold, hot, t);
    matRef.current.emissive.lerpColors(new THREE.Color('#000000'), new THREE.Color('#ff6b35'), t * 0.6);
    matRef.current.emissiveIntensity = t * 1.5;
    if (meshRef.current) {
      // Subtle scale pulse when hot
      const pulse = 1 + Math.sin(Date.now() * 0.005) * t * 0.05;
      meshRef.current.scale.x = pulse;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[0, 0.15, -6]}
      name="reaction-bar"
    >
      <planeGeometry args={[2, 0.1]} />
      <meshStandardMaterial
        ref={matRef}
        color="#222222"
        emissive="#000000"
        emissiveIntensity={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
