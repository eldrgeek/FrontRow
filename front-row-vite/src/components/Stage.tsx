
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Plane, Cylinder } from '@react-three/drei';
import * as THREE from 'three';
import YouTubeScreen from './YouTubeScreen';

interface StageProps {
  config: {
    artistName: string;
  };
  showState: 'pre-show' | 'live' | 'post-show';
  fallbackVideoUrl?: string;
}

// Semicircle stage platform component
function SemicircleStage(): JSX.Element {
  return (
    <group>
      {/* Main semicircle stage platform - rotated 90 degrees clockwise */}
      <Cylinder
        args={[8, 8, 0.2, 32, 1, false, -Math.PI/2, Math.PI]} // rotated 90 degrees clockwise
        position={[0, 0.1, -8]}
        rotation-x={0}
      >
        <meshStandardMaterial color="#444444" />
      </Cylinder>
      
      {/* Stage edge for visual definition */}
      <Cylinder
        args={[8.1, 8.1, 0.25, 32, 1, false, -Math.PI/2, Math.PI]}
        position={[0, 0.05, -8]}
        rotation-x={0}
      >
        <meshStandardMaterial color="#333333" />
      </Cylinder>
    </group>
  );
}

// Flat screen component for the back wall
function CurvedScreen({ videoTexture, fallbackVideoId = "K6ZeroIZd5g" }: { videoTexture: any; fallbackVideoId?: string }): JSX.Element {
  const hasLiveStream = !!videoTexture;
  
  return (
    <group>
      {/* Large flat screen at the back of the semicircle stage */}
      <Plane
        args={[14, 8]} // Wide screen for better viewing
        position={[0, 4, -12]} // Positioned at the back, higher up
        rotation-x={0}
      >
        {hasLiveStream ? (
          <meshBasicMaterial 
            toneMapped={false}
            side={THREE.DoubleSide}
          >
            <primitive attach="map" object={videoTexture} />
          </meshBasicMaterial>
        ) : (
          <meshBasicMaterial color="#111111" side={THREE.DoubleSide} />
        )}
      </Plane>
      
      {/* Screen frame */}
      <Plane
        args={[14.4, 8.4]}
        position={[0, 4, -12.01]} // Slightly behind the screen
        rotation-x={0}
      >
        <meshBasicMaterial color="#222222" side={THREE.DoubleSide} />
      </Plane>
      
      {/* YouTube fallback when no live stream */}
      {!hasLiveStream && (
        <YouTubeScreen 
          videoId={fallbackVideoId}
          position={[0, 4, -11.5]} // Positioned in front of the screen
          isLive={false}
        />
      )}
    </group>
  );
}

function Stage({ config, showState, fallbackVideoUrl = "https://youtu.be/K6ZeroIZd5g" }: StageProps): JSX.Element {
  const stageRef = useRef<THREE.Group>(null);

  // Create a video texture from the performer stream
  // Note: For now, we'll disable video texture to avoid conditional hook calls
  // const videoTexture = useVideoTexture(performerStream, {...options});
  const videoTexture = null;


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
      {/* Semicircle Stage Platform */}
      <SemicircleStage />

      {/* Curved backdrop / Performer Video Screen - positioned at back of semicircle stage */}
      <CurvedScreen videoTexture={videoTexture} fallbackVideoId={fallbackVideoUrl} />

      {/* Artist name stencil on stage floor - moved forward to avoid overlap */}
      <Text
        position={[0, 0.02, -1]}
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
