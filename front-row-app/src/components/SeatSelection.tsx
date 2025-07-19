
import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Text, Box, Html } from '@react-three/drei';
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

interface SeatSelectionProps {
  selectedSeat: string | null;
  onSeatSelect: (seatId: string) => void;
  audienceSeats: AudienceSeats;
}

function SeatSelection({ selectedSeat, onSeatSelect, audienceSeats }: SeatSelectionProps): JSX.Element {
  const seatsData: SeatData[] = [];
  const frontRowRadius = 6;
  const stageZOffset = -5; // Stage position in Z

  // Generate 9 seat positions in a 270-degree arc around the center (0,0)
  // Angle for 270 degrees (3/2 * PI) spread across 9 seats.
  // Start angle to center the 270 degrees: (PI / 2) - (3 * Math.PI / 4) = -PI/4
  const startAngle = -Math.PI / 4;
  const endAngle = startAngle + (3 * Math.PI / 2); // 270 degrees

  for (let i = 0; i < 9; i++) {
    const angle = startAngle + (i / 8) * (endAngle - startAngle); // Distribute evenly
    const x = frontRowRadius * Math.cos(angle);
    const z = frontRowRadius * Math.sin(angle) + stageZOffset; // Offset back from stage
    seatsData.push({ id: `seat-${i}`, position: [x, 0.5, z] });
  }

  return (
    <group>
      {seatsData.map((seat) => (
        <Seat
          key={seat.id}
          seat={seat}
          isSelected={selectedSeat === seat.id}
          isOccupied={!!audienceSeats[seat.id]}
          occupantName={audienceSeats[seat.id]?.name}
          occupantImage={audienceSeats[seat.id]?.imageUrl}
          onSelect={onSeatSelect}
        />
      ))}
    </group>
  );
}

interface SeatProps {
  seat: SeatData;
  isSelected: boolean;
  isOccupied: boolean;
  occupantName?: string;
  occupantImage?: string;
  onSelect: (seatId: string) => void;
}

function Seat({ seat, isSelected, isOccupied, occupantName, occupantImage, onSelect }: SeatProps): JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null);

  const handleClick = () => {
    if (!isOccupied && !isSelected) {
      onSelect(seat.id);
    }
  };

  const color = isOccupied ? 'darkred' : (isSelected ? 'gold' : 'blue');

  // Load image as a texture
  const texture = useRef(null);
  useEffect(() => {
    if (occupantImage) {
      const img = new Image();
      img.src = occupantImage;
      img.onload = () => {
        texture.current = new THREE.Texture(img);
        texture.current.needsUpdate = true;
        if (meshRef.current && meshRef.current.material) {
            meshRef.current.material.map = texture.current;
            meshRef.current.material.needsUpdate = true;
        }
      };
    } else {
        texture.current = null; // Clear texture if no image
        if (meshRef.current && meshRef.current.material) {
            meshRef.current.material.map = null;
            meshRef.current.material.needsUpdate = true;
        }
    }
  }, [occupantImage]);


  return (
    <group position={seat.position} rotation-y={-Math.atan2(seat.position[0], seat.position[2] - (-5))}> {/* Rotate to face center/stage */}
      <Box
        args={[1, 1, 1]}
        ref={meshRef}
        onClick={handleClick}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={color} map={texture.current} />
      </Box>
      {isOccupied && (
        <>
          <Text
            position={[0, 1.2, 0]}
            fontSize={0.3}
            color="white"
            anchorX="center"
            anchorY="middle"
            rotation-x={-Math.PI / 2}
          >
            {occupantName}
          </Text>
        </>
      )}
    </group>
  );
}

export default SeatSelection;
