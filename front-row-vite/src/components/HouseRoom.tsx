// The room around the stage: patterned red carpet and velvet walls, so the
// house reads as a small club in the Village rather than a void. Textures are
// drawn on canvases at start-up, so nothing is fetched.
import React, { useMemo } from 'react';
import * as THREE from 'three';

function carpetTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5a0c18';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(212,175,55,0.3)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(64, 14); g.lineTo(114, 64); g.lineTo(64, 114); g.lineTo(14, 64); g.closePath();
  g.stroke();
  g.fillStyle = 'rgba(246,227,161,0.4)';
  g.beginPath(); g.arc(64, 64, 5, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(36, 36);
  t.anisotropy = 4;
  return t;
}

function velvetTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 8;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 256, 0);
  for (let i = 0; i <= 8; i++) {
    grad.addColorStop(i / 8, i % 2 ? '#8d0f1f' : '#3a0610');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(14, 1);
  return t;
}

function HouseRoom(): JSX.Element {
  const carpet = useMemo(carpetTexture, []);
  const velvet = useMemo(velvetTexture, []);
  return (
    <group>
      <color attach="background" args={['#140508']} />
      <fog attach="fog" args={['#140508', 22, 48]} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, -2]}>
        <circleGeometry args={[24, 64]} />
        <meshStandardMaterial map={carpet} roughness={0.95} />
      </mesh>
      <mesh position={[0, 8, -2]}>
        <cylinderGeometry args={[24, 24, 16, 64, 1, true]} />
        <meshStandardMaterial map={velvet} side={THREE.BackSide} roughness={0.9} />
      </mesh>
    </group>
  );
}

export default HouseRoom;
