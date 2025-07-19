
import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Plane, useVideoTexture } from '@react-three/drei';
import * as THREE from 'three';

interface StageProps {
  config: {
    artistName: string;
  };
  showState: 'pre-show' | 'live' | 'post-show';
  performerStream: MediaStream | null;
}

function Stage({ config, showState, performerStream }: StageProps): JSX.Element {
  const stageRef = useRef<THREE.Group>(null);
  const videoMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Create a video texture from the performer stream
  // This hook updates the texture automatically
  // Ensure performerStream is a MediaStream object for useVideoTexture
  const videoTexture = performerStream ? useVideoTexture(performerStream, {
    // Add these options to prevent WebGL warnings and ensure proper playback
    loop: false,
    muted: true, // Auto-play policies often require muted
    crossOrigin: 'anonymous', // For security if source is external
    start: true, // Start playback immediately
    playsInline: true // Crucial for mobile devices
  }) : null;


  // Animation for countdown or live indicator
  useFrame(() => {
    // Basic show state animation (e.g., pulsing live text)
    if (showState === 'live' && stageRef.current) {
      // Example: simple scale animation for a "LIVE" text
      // This text is now rendered in App.js HTML overlay for simplicity
    }
  });

  return (
    <group ref={stageRef}>
      {/* Stage floor */}
      <Plane args={[10, 6]} rotation-x={-Math.PI / 2} position={[0, 0.01, -5]}>
        <meshStandardMaterial color="gray" />
      </Plane>

      {/* Stage backdrop / Screen */}
      <Plane args={[10, 5]} position={[0, 2.5, -8]}>
        {videoTexture ? (
          // Use the video texture when stream is available
          <meshBasicMaterial toneMapped={false}>
            <primitive attach="map" object={videoTexture} />
          </meshBasicMaterial>
        ) : (
          // Fallback material when no stream (e.g., black screen)
          <meshBasicMaterial color="black" />
        )}
      </Plane>

      {/* Artist name stencil on stage floor */}
      <Text
        position={[0, 0.02, -4]}
        rotation-x={-Math.PI / 2}
        fontSize={0.8}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {config.artistName}
      </Text>

    </group>
  );
}

export default Stage;
