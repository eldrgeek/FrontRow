
import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text, Box } from '@react-three/drei';

interface PerformerViewProps {
  performerStream: MediaStream | null;
}

function PerformerView({ performerStream }: PerformerViewProps): JSX.Element {
  const { camera } = useThree();
  const dummyTarget = useRef(new THREE.Vector3(0, 0.5, -5)); // Center of stage
  const dummyUp = useRef(new THREE.Vector3(0, 1, 0));

  // Position camera directly in front of the stage, facing the audience
  useFrame(() => {
    camera.position.set(0, 1.7, -3); // Just in front of the stage, slightly above
    camera.lookAt(dummyTarget.current); // Look at the center of the stage
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
      {/* Future: Render audience members from performer's perspective if desired */}
    </>
  );
}

export default PerformerView;
