
import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Box, Text } from '@react-three/drei';
import * as THREE from 'three';

interface AudienceSeat {
  name: string;
  imageUrl: string;
  socketId: string;
}

interface AudienceSeats {
  [seatId: string]: AudienceSeat;
}

interface SeatData {
  id: string;
  position: [number, number, number];
}

interface UserViewProps {
  selectedSeat: string | null;
  audienceSeats: AudienceSeats;
}

function UserView({ selectedSeat, audienceSeats }: UserViewProps): JSX.Element {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3(0, 2.5, -8)); // Center of stage screen
  const up = useRef(new THREE.Vector3(0, 1, 0));

  const seatsData: SeatData[] = [];
  const frontRowRadius = 6;
  const stageZOffset = -5; // Stage position in Z

  // Generate 9 seat positions (same logic as SeatSelection)
  const startAngle = -Math.PI / 4;
  const endAngle = startAngle + (3 * Math.PI / 2); // 270 degrees
  for (let i = 0; i < 9; i++) {
    const angle = startAngle + (i / 8) * (endAngle - startAngle);
    const x = frontRowRadius * Math.cos(angle);
    const z = frontRowRadius * Math.sin(angle) + stageZOffset;
    seatsData.push({ id: `seat-${i}`, position: [x, 0.5, z] });
  }

  // Find the position of the selected seat
  const currentSeat = seatsData.find(s => s.id === selectedSeat);

  useFrame(() => {
    if (currentSeat) {
      // Position camera at the seat location + slight offset for perspective
      camera.position.set(currentSeat.position[0], currentSeat.position[1] + 1.2, currentSeat.position[2] + 0.5); // Eyesight height
      camera.lookAt(target.current); // Look at the center of the stage screen
      camera.up.copy(up.current); // Maintain upright orientation
    }
  });

  return (
    <group>
      {/* Render peripheral awareness of other audience members */}
      {seatsData.map(seat => {
        if (seat.id !== selectedSeat && audienceSeats[seat.id]) {
          return (
            <group key={seat.id} position={seat.position}>
              <Box args={[1, 1, 1]}>
                <meshStandardMaterial color="darkgrey" /> {/* Simple placeholder for other occupied seats */}
              </Box>
              <Text
                position={[0, 1.2, 0]}
                fontSize={0.2}
                color="white"
                anchorX="center"
                anchorY="middle"
                rotation-x={-Math.PI / 2}
              >
                {audienceSeats[seat.id]?.name}
              </Text>
            </group>
          );
        }
        return null;
      })}
    </group>
  );
}

export default UserView;
