
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Plane, Cylinder } from '@react-three/drei';
import * as THREE from 'three';
import YouTubeScreen from './YouTubeScreen';
import useVideoTexture from '../hooks/useVideoTexture';

interface StageProps {
  config: {
    artistName: string;
  };
  showState: 'idle' | 'pre-show' | 'live' | 'post-show';
  fallbackVideoUrl?: string;
  screenPosition?: [number,number,number];
  performerStream?: MediaStream | null;
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
      {/* Apron rectangle between stage flat edge and screen */}
      <Plane args={[16.0, 4]} rotation-x={-Math.PI / 2} position={[0, 0.11, -10]}>
        <meshStandardMaterial color="#444444" side={THREE.DoubleSide} />
      </Plane>
    </group>
  );
}

// Flat screen component for the back wall
function CurvedScreen({ videoTexture, fallbackVideoId = "K6ZeroIZd5g", screenPosition, showState } : { videoTexture: THREE.VideoTexture | null; fallbackVideoId?: string; screenPosition:[number,number,number]; showState: 'idle' | 'pre-show' | 'live' | 'post-show' }): JSX.Element {
  const hasLiveStream = !!videoTexture;
  
  console.log('CurvedScreen: hasLiveStream =', hasLiveStream, 'videoTexture =', videoTexture);
  
  // Calculate screen dimensions based on video aspect ratio
  let screenWidth = 12; // Default width
  let screenHeight = 5; // Default height
  
  if (hasLiveStream && videoTexture && videoTexture.userData.aspectRatio) {
    const aspectRatio = videoTexture.userData.aspectRatio;
    console.log('Using video aspect ratio:', aspectRatio);
    
    // Keep width constant, adjust height to maintain aspect ratio
    screenWidth = 12;
    screenHeight = screenWidth / aspectRatio;
    
    // Ensure reasonable size limits
    if (screenHeight > 8) {
      screenHeight = 8;
      screenWidth = screenHeight * aspectRatio;
    }
    if (screenHeight < 3) {
      screenHeight = 3;
      screenWidth = screenHeight * aspectRatio;
    }
    
    console.log('Adjusted screen dimensions:', screenWidth, 'x', screenHeight);
  }
  
  return (
    <group>
      {/* Large flat screen at the back of the semicircle stage */}
      <Plane
        args={[screenWidth, screenHeight]}
        position={screenPosition}
        rotation-x={0}
      >
        {hasLiveStream ? (
          // Live stream mode - show video with corrected orientation
          <meshBasicMaterial 
            toneMapped={false}
            side={THREE.FrontSide}
          >
            <primitive attach="map" object={videoTexture} />
          </meshBasicMaterial>
        ) : (
          // Default mode - dark screen
          <meshBasicMaterial color="#111111" side={THREE.FrontSide} />
        )}
      </Plane>
      
      {/* Screen frame - slightly larger than the screen */}
      <Plane args={[screenWidth + 0.4, screenHeight + 0.4]} position={[screenPosition[0], screenPosition[1], screenPosition[2]-0.01]}
        rotation-x={0}
      >
        <meshBasicMaterial color="#222222" side={THREE.DoubleSide} />
      </Plane>
      
      {/* YouTube fallback when no live stream */}
      {!hasLiveStream && (
        <YouTubeScreen 
          videoId={fallbackVideoId}
          position={[screenPosition[0], screenPosition[1], screenPosition[2]+0.5]} // slightly in front
          isLive={false}
        />
      )}
    </group>
  );
}

function Stage({ config, showState, fallbackVideoUrl = "https://youtu.be/K6ZeroIZd5g", screenPosition=[0,3.5,-12], performerStream }: StageProps): JSX.Element {
  const stageRef = useRef<THREE.Group>(null);

  // Create a video texture from the performer stream
  const videoTexture = useVideoTexture(performerStream || null);
  
  // Debug logging
  console.log('Stage: performerStream =', performerStream ? 'Stream present' : 'No stream');
  console.log('Stage: videoTexture =', videoTexture ? 'Texture created' : 'No texture');
  console.log('Stage: showState =', showState);
  console.log('Stage: YouTube fallback will show =', !videoTexture);


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

      {/* Flat backdrop / Performer Video Screen */}
      <CurvedScreen videoTexture={videoTexture} fallbackVideoId={fallbackVideoUrl} screenPosition={screenPosition} showState={showState} />

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
