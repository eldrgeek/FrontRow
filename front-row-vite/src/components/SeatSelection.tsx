
import React, { useRef, useEffect } from 'react';
import { Text, Box } from '@react-three/drei';
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
  allowSeatSwitching?: boolean;
}

function SeatSelection({ selectedSeat, onSeatSelect, audienceSeats, allowSeatSwitching = true }: SeatSelectionProps): JSX.Element {
  const seatsData: SeatData[] = [];
  const frontRowRadius = 10; // Increased radius for better spacing
  const stageZOffset = -8; // Stage position in Z

  // Generate 9 seat positions in a 180-degree arc around the semicircle 
  // Rotated 90 degrees clockwise so they face the back screen
  const startAngle = 0; // Start from front (0 degrees)
  const endAngle = Math.PI; // End at back (180 degrees) 
  const totalSeats = 9;

  for (let i = 0; i < totalSeats; i++) {
    const angle = startAngle + (i / (totalSeats - 1)) * (endAngle - startAngle);
    const x = frontRowRadius * Math.cos(angle);
    const z = frontRowRadius * Math.sin(angle) + stageZOffset; // Align with stage
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
          allowSwitching={allowSeatSwitching}
          hasSelectedSeat={!!selectedSeat}
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
  allowSwitching?: boolean;
  hasSelectedSeat?: boolean;
}

function Seat({ seat, isSelected, isOccupied, occupantName, occupantImage, onSelect, allowSwitching = true, hasSelectedSeat = false }: SeatProps): JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null);

  const handleClick = () => {
    // Allow clicking if:
    // 1. Seat is not occupied by someone else AND not currently selected, OR
    // 2. Seat switching is allowed and user has a selected seat (can switch to any unoccupied seat)
    if (!isOccupied && !isSelected) {
      onSelect(seat.id);
    } else if (allowSwitching && hasSelectedSeat && !isOccupied) {
      // Switch to this seat (will automatically give up current seat)
      onSelect(seat.id);
    }
  };

  // Color logic: occupied=darkred, selected=gold, available for switching=lightblue, regular available=blue
  const isClickableForSwitch = allowSwitching && hasSelectedSeat && !isOccupied && !isSelected;
  const color = isOccupied ? 'darkred' : (isSelected ? 'gold' : (isClickableForSwitch ? 'lightblue' : 'blue'));

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
            const material = meshRef.current.material as THREE.MeshStandardMaterial;
            material.map = texture.current;
            material.needsUpdate = true;
        }
      };
    } else {
        texture.current = null; // Clear texture if no image
        if (meshRef.current && meshRef.current.material) {
            const material = meshRef.current.material as THREE.MeshStandardMaterial;
            material.map = null;
            material.needsUpdate = true;
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
