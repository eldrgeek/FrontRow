
import React from 'react';
import { Text, Box } from '@react-three/drei';
import { ThreeEvent } from '@react-three/fiber';
import PhotoCube from './PhotoCube';

interface AudienceSeat {
  name: string;
  imageUrl: string;
  socketId: string;
  captureMode: 'photo' | 'video';
  hasVideoStream?: boolean;
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
  mySocketId?: string;
  myVideoStream?: MediaStream;
  myCaptureMode?: 'photo' | 'video';
}

function SeatSelection({ selectedSeat, onSeatSelect, audienceSeats, allowSeatSwitching = true, mySocketId, myVideoStream, myCaptureMode }: SeatSelectionProps): JSX.Element {
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
          occupantSocketId={audienceSeats[seat.id]?.socketId}
          occupantCaptureMode={audienceSeats[seat.id]?.captureMode}
          occupantVideoStream={undefined} // Video streams will be handled via WebRTC
          mySocketId={mySocketId}
          myVideoStream={myVideoStream}
          myCaptureMode={myCaptureMode}
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
  occupantSocketId?: string;
  occupantCaptureMode?: 'photo' | 'video';
  occupantVideoStream?: MediaStream;
  mySocketId?: string;
  myVideoStream?: MediaStream;
  myCaptureMode?: 'photo' | 'video';
  onSelect: (seatId: string) => void;
  allowSwitching?: boolean;
  hasSelectedSeat?: boolean;
}

function Seat({ seat, isSelected, isOccupied, occupantName, occupantImage, occupantSocketId, occupantCaptureMode, occupantVideoStream, mySocketId, myVideoStream, myCaptureMode, onSelect, allowSwitching = true, hasSelectedSeat = false }: SeatProps): JSX.Element {
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

  const handlePointerDown = (event: ThreeEvent<MouseEvent>) => {
    // Prevent event bubbling and ensure touch events work on mobile
    event.stopPropagation();
    handleClick();
  };

  // Color logic: occupied=darkred, selected=gold, available=blue
  const occupiedByMe = isOccupied && occupantSocketId === mySocketId;
  const color = occupiedByMe
    ? 'gold'
    : isOccupied
      ? 'darkred'
      : isSelected
        ? 'gold'
        : 'blue'; // Keep all unoccupied seats blue

  // Mobile-friendly seat size - larger for easier touch
  const seatSize = window.innerWidth < 768 ? 1.3 : 1; // Larger seats on mobile
  const nameTextSize = window.innerWidth < 768 ? 0.15 : 0.12; // Much smaller text to avoid obscuring view

  return (
    <group position={seat.position} rotation-y={-Math.atan2(seat.position[0], seat.position[2] - (-5))}> {/* Rotate to face center/stage */}
      <group
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerOver={(e) => {
          // Visual feedback on hover/touch
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'default';
        }}
      >
        {/* Seat cube at floor level */}
        <Box
          args={[seatSize, seatSize, seatSize]}
          position={[0, 0, 0]}
        >
          <meshStandardMaterial 
            color={color}
            opacity={0.9}
          />
        </Box>
        
        {/* Add a subtle glow effect only for truly interactive seats */}
        {!isOccupied && !hasSelectedSeat && (
          <Box
            args={[seatSize * 1.1, seatSize * 1.1, seatSize * 1.1]}
            position={[0, 0, 0]}
          >
            <meshStandardMaterial 
              color="blue"
              transparent={true}
              opacity={0.2}
              emissive="blue"
              emissiveIntensity={0.1}
            />
          </Box>
        )}
      </group>

      {/* Photo cube above seat - only for occupied seats */}
      {isOccupied && (
        <PhotoCube
          imageUrl={occupantImage}
          videoStream={occupantSocketId === mySocketId ? myVideoStream : occupantVideoStream}
          captureMode={occupantSocketId === mySocketId ? myCaptureMode : occupantCaptureMode}
          position={[0, seatSize + seatSize/2, 0]}
          size={seatSize}
          color={color}
          opacity={0.9}
        />
      )}

      {/* Text elements outside clickable group to prevent click interference */}
      {isOccupied && (
        <>
          <Text
            position={[0, -0.3, 0.8]}
            fontSize={nameTextSize}
            color="white"
            anchorX="center"
            anchorY="middle"
          >
            {occupantName}
          </Text>
        </>
      )}
      
      {/* Add seat number for easier identification on mobile */}
      <Text
        position={[0, -0.7, 0]}
        fontSize={0.2}
        color="rgba(255, 255, 255, 0.7)"
        anchorX="center"
        anchorY="middle"
        rotation-x={-Math.PI / 2}
      >
        {seat.id.replace('seat-', 'Seat ')}
      </Text>
    </group>
  );
}

export default SeatSelection;
