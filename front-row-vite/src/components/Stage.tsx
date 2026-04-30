
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Plane, Cylinder } from '@react-three/drei';
import * as THREE from 'three';
import YouTubeScreen from './YouTubeScreen';
import useVideoTexture from '../hooks/useVideoTexture';
import PerformerMesh from './PerformerMesh';
import ReactionBar from './ReactionBar';

interface StageProps {
  config: {
    artistName: string;
  };
  showState: 'idle' | 'pre-show' | 'live' | 'post-show';
  fallbackVideoUrl?: string;
  screenPosition?: [number, number, number];
  performerStream?: MediaStream | null;
  countdownTime?: number;
  isCountdownActive?: boolean;
  isPerformer?: boolean;
  /** Phase 2: performer mesh on stage instead of CurvedScreen */
  performerOnStage?: boolean;
  performerStageZ?: number;
  performerStageX?: number;
  performerOpacity?: number;
  /** Phase 2: curtain state */
  curtainOpen?: boolean;
  curtainStyle?: string;
  /** Phase 2: reaction level 0-100 */
  reactionLevel?: number;
  /** Phase 2: spotlight */
  spotlightActive?: boolean;
}

// Semicircle stage platform component
function SemicircleStage(): JSX.Element {
  return (
    <group>
      {/* Main semicircle stage platform - rotated 90 degrees clockwise */}
      <Cylinder
        args={[8, 8, 0.2, 32, 1, false, -Math.PI / 2, Math.PI]}
        position={[0, 0.1, -8]}
        rotation-x={0}
      >
        <meshStandardMaterial color="#444444" />
      </Cylinder>

      {/* Stage edge for visual definition */}
      <Cylinder
        args={[8.1, 8.1, 0.25, 32, 1, false, -Math.PI / 2, Math.PI]}
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
function CurvedScreen({
  videoTexture,
  fallbackVideoId = 'K6ZeroIZd5g',
  screenPosition,
  showState,
  isPerformer = false,
  hidden = false,
}: {
  videoTexture: THREE.VideoTexture | null;
  fallbackVideoId?: string;
  screenPosition: [number, number, number];
  showState: 'idle' | 'pre-show' | 'live' | 'post-show';
  isPerformer?: boolean;
  hidden?: boolean;
}): JSX.Element | null {
  if (hidden) return null;

  const hasLiveStream = !!videoTexture;

  let screenWidth = 12;
  let screenHeight = 5;

  if (hasLiveStream && videoTexture && videoTexture.userData.aspectRatio) {
    const aspectRatio = videoTexture.userData.aspectRatio;
    screenWidth = 12;
    screenHeight = screenWidth / aspectRatio;
    if (screenHeight > 8) { screenHeight = 8; screenWidth = screenHeight * aspectRatio; }
    if (screenHeight < 3) { screenHeight = 3; screenWidth = screenHeight * aspectRatio; }
  }

  const minBottomY = 2.0;
  const adjustedY = Math.max(screenPosition[1], minBottomY + screenHeight / 2);
  const adjustedScreenPosition: [number, number, number] = [screenPosition[0], adjustedY, screenPosition[2]];

  return (
    <group>
      <Plane args={[screenWidth, screenHeight]} position={adjustedScreenPosition} rotation-x={0}>
        {hasLiveStream ? (
          <meshBasicMaterial toneMapped={false} side={THREE.FrontSide}>
            <primitive attach="map" object={videoTexture} />
          </meshBasicMaterial>
        ) : (
          <meshBasicMaterial color="#111111" side={THREE.FrontSide} />
        )}
      </Plane>
      <Plane
        args={[screenWidth + 0.4, screenHeight + 0.4]}
        position={[adjustedScreenPosition[0], adjustedScreenPosition[1], adjustedScreenPosition[2] - 0.01]}
        rotation-x={0}
      >
        <meshBasicMaterial color="#222222" side={THREE.DoubleSide} />
      </Plane>
      {!hasLiveStream && (
        <YouTubeScreen
          videoId={fallbackVideoId}
          position={[adjustedScreenPosition[0], adjustedScreenPosition[1], adjustedScreenPosition[2] + 0.5]}
          isLive={false}
          isPerformer={isPerformer}
        />
      )}
      {/* keep showState in scope to avoid lint warning */}
      {showState === 'post-show' && null}
    </group>
  );
}

// ── Curtain mesh ──────────────────────────────────────────────────────────────
interface CurtainProps {
  side: 'left' | 'right';
  open: boolean;
  style: string;
}

function Curtain({ side, open, style }: CurtainProps): JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null);
  const targetX = open ? (side === 'left' ? -9 : 9) : (side === 'left' ? -3 : 3);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.x += (targetX - meshRef.current.position.x) * 0.08;
    }
  });

  const color = style === 'velvet-red' ? '#8B0000' : style === 'none' ? 'transparent' : style;
  if (style === 'none') return <></>;

  const startX = side === 'left' ? -3 : 3;

  return (
    <mesh ref={meshRef} position={[startX, 5, -11]}>
      <planeGeometry args={[6, 10]} />
      <meshStandardMaterial
        color={color}
        side={THREE.DoubleSide}
        roughness={0.8}
        metalness={0.05}
      />
    </mesh>
  );
}

// ── Stage component ───────────────────────────────────────────────────────────
function Stage({
  config,
  showState,
  fallbackVideoUrl = 'https://youtu.be/K6ZeroIZd5g',
  screenPosition = [0, 7.30, -12],
  performerStream,
  countdownTime = 0,
  isCountdownActive = false,
  isPerformer = false,
  performerOnStage = false,
  performerStageZ = -8,
  performerStageX = 0,
  performerOpacity = 1,
  curtainOpen = false,
  curtainStyle = 'velvet-red',
  reactionLevel = 0,
  spotlightActive = false,
}: StageProps): JSX.Element {
  const stageRef = useRef<THREE.Group>(null);
  const videoTexture = useVideoTexture(performerStream || null);

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useFrame(() => {
    if (showState === 'live' && stageRef.current) {
      // reserved for future animation
    }
  });

  return (
    <group ref={stageRef}>
      {/* Semicircle Stage Platform */}
      <SemicircleStage />

      {/* Flat backdrop — hidden when performer is on stage mesh */}
      <CurvedScreen
        videoTexture={videoTexture}
        fallbackVideoId={fallbackVideoUrl}
        screenPosition={screenPosition}
        showState={showState}
        isPerformer={isPerformer}
        hidden={performerOnStage}
      />

      {/* Phase 2: Performer mesh on stage floor */}
      {performerOnStage && performerStream && (
        <PerformerMesh
          stream={performerStream}
          stageZ={performerStageZ}
          stageX={performerStageX}
          opacity={performerOpacity}
          visible={true}
        />
      )}

      {/* Phase 2: Curtains */}
      <Curtain side="left" open={curtainOpen} style={curtainStyle} />
      <Curtain side="right" open={curtainOpen} style={curtainStyle} />

      {/* Phase 2: Reaction bar at apron edge */}
      <ReactionBar level={reactionLevel} />

      {/* Phase 2: Spotlight following performer */}
      {spotlightActive && (
        <spotLight
          position={[performerStageX, 10, performerStageZ + 2]}
          target-position={[performerStageX, 0, performerStageZ]}
          intensity={3}
          angle={0.4}
          penumbra={0.3}
          color="#fffde0"
          castShadow={false}
        />
      )}

      {/* Artist name stencil on stage floor */}
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

      {/* Countdown Display */}
      {isCountdownActive && (
        <group>
          <Plane args={[8, 3]} position={[0, 4, -10]} rotation-x={0}>
            <meshBasicMaterial color="#000000" opacity={0.8} transparent />
          </Plane>
          <Text position={[0, 4, -9.5]} fontSize={1.2} color="#ff3b3b" anchorX="center" anchorY="middle" fontWeight="bold">
            {formatCountdown(countdownTime)}
          </Text>
          <Text position={[0, 2.5, -9.5]} fontSize={0.6} color="white" anchorX="center" anchorY="middle">
            SHOW STARTING...
          </Text>
        </group>
      )}

      {/* 3D Status Text */}
      {showState === 'pre-show' && !isCountdownActive && (
        <Text position={[0, 5, -11]} fontSize={0.8} color="white" anchorX="center" anchorY="middle">SHOW STARTS SOON!</Text>
      )}
      {showState === 'live' && (
        <Text position={[0, 5, -11]} fontSize={0.8} color="#ff3b3b" anchorX="center" anchorY="middle">LIVE</Text>
      )}
      {showState === 'post-show' && (
        <Text position={[0, 5, -11]} fontSize={0.8} color="white" anchorX="center" anchorY="middle">THANK YOU!</Text>
      )}
    </group>
  );
}

export default Stage;
