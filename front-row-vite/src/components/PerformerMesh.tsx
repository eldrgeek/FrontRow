import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface PerformerMeshProps {
  stream: MediaStream | null;
  /** Current z position (animated by parent) */
  stageZ: number;
  stageX?: number;
  opacity?: number;
  visible?: boolean;
}

/**
 * PerformerMesh — a Three.js plane on stage that renders the performer's
 * live video stream as a VideoTexture. Positioned at [stageX, 0, stageZ].
 */
export default function PerformerMesh({
  stream,
  stageZ,
  stageX = 0,
  opacity = 1,
  visible = true,
}: PerformerMeshProps): JSX.Element | null {
  const meshRef = useRef<THREE.Mesh>(null);
  const textureRef = useRef<THREE.VideoTexture | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!stream) {
      setReady(false);
      return;
    }

    const video = document.createElement('video');
    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    videoRef.current = video;

    const onPlay = () => {
      const tex = new THREE.VideoTexture(video);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.format = THREE.RGBAFormat;
      textureRef.current = tex;
      setReady(true);
    };

    video.addEventListener('playing', onPlay);
    video.play().catch(() => {/* will fire via event */});

    return () => {
      video.removeEventListener('playing', onPlay);
      video.srcObject = null;
      textureRef.current?.dispose();
      textureRef.current = null;
      setReady(false);
    };
  }, [stream]);

  useFrame(() => {
    if (textureRef.current) textureRef.current.needsUpdate = true;
    if (meshRef.current) {
      meshRef.current.position.x = stageX;
      meshRef.current.position.z = stageZ;
      (meshRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
    }
  });

  if (!ready || !visible) return null;

  return (
    <mesh
      ref={meshRef}
      position={[stageX, 2.5, stageZ]}
      data-testid="performer-mesh"
    >
      {/* 3.2 × 5.8 plane — roughly human-proportioned */}
      <planeGeometry args={[3.2, 5.8]} />
      <meshBasicMaterial
        side={THREE.FrontSide}
        transparent={opacity < 1}
        opacity={opacity}
      >
        {textureRef.current && (
          <primitive attach="map" object={textureRef.current} />
        )}
      </meshBasicMaterial>
    </mesh>
  );
}
