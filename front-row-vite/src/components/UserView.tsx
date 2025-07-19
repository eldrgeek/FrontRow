
import React, { useRef } from 'react';
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
  const frontRowRadius = 10; // Increased radius for better spacing
  const stageZOffset = -8; // Stage position in Z

  // Generate 9 seat positions (same logic as SeatSelection)
  const startAngle = 0; // Start from front (0 degrees)
  const endAngle = Math.PI; // End at back (180 degrees)
  const totalSeats = 9;
  for (let i = 0; i < totalSeats; i++) {
    const angle = startAngle + (i / (totalSeats - 1)) * (endAngle - startAngle);
    const x = frontRowRadius * Math.cos(angle);
    const z = frontRowRadius * Math.sin(angle) + stageZOffset; // Align with stage
    seatsData.push({ id: `seat-${i}`, position: [x, 0.5, z] });
  }

  // Find the position of the selected seat
  const currentSeat = seatsData.find(s => s.id === selectedSeat);

  // Camera movement handled centrally in CameraController for smooth easing

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
