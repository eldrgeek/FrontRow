
import React, { useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { Text } from '@react-three/drei';

interface PerformerViewProps {
  localStream?: MediaStream | null;
}

function PerformerView({ localStream }: PerformerViewProps): JSX.Element {
  const { camera } = useThree();
  const dummyTarget = useRef(new THREE.Vector3(0, 0.5, -5)); // Center of stage
  const dummyUp = useRef(new THREE.Vector3(0, 1, 0));

  // Position camera on stage, facing the audience
  useFrame(() => {
    camera.position.set(0, 1.7, -8); // On the stage, facing outward toward audience
    camera.lookAt(0, 1.7, 15); // Look toward the audience seating area
    camera.up.copy(dummyUp.current); // Maintain upright orientation
  });

  return (
    <>
      {/* Visual cue for performer's own view (e.g., an indicator) */}
      <group position={[0, 3, -1]}>
        <Text
          fontSize={0.4}
          color="white"
          anchorX="center"
          anchorY="middle"
          rotation-y={Math.PI} // Flip for performer's view
        >
          YOUR PERFORMANCE VIEW
        </Text>
      </group>

      {/* Local video preview for artist - positioned in bottom right */}
      {localStream && (
        <Html
          position={[8, 2, 5]} // Bottom right of the performer's view
          transform
          occlude="blending"
          style={{
            width: '300px',
            height: '200px',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '10px',
              overflow: 'hidden',
              boxShadow: '0 0 20px rgba(0,0,0,0.8)',
              background: '#000',
              border: '2px solid #ffd700'
            }}
          >
            <video
              style={{ 
                width: '100%', 
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)' // Mirror the video for natural self-view
              }}
              autoPlay
              muted
              playsInline
              ref={(video) => {
                if (video && localStream) {
                  video.srcObject = localStream;
                }
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: '5px',
                left: '5px',
                background: 'rgba(0,0,0,0.7)',
                color: 'white',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold'
              }}
            >
              YOU
            </div>
          </div>
        </Html>
      )}
      
      {/* Future: Render audience members from performer's perspective if desired */}
    </>
  );
}

export default PerformerView;
