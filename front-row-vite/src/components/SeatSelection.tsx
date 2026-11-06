
import React from 'react';
import { Text, Box, Billboard } from '@react-three/drei';
import { ThreeEvent } from '@react-three/fiber';
import PhotoCube from './PhotoCube';
import { seatLabel, seatLayout } from '../lib/seatLayout';

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
  hideMyPhoto?: boolean;
  audienceStreams?: Map<string, MediaStream>;
}

function SeatSelection({ selectedSeat, onSeatSelect, audienceSeats, allowSeatSwitching = true, mySocketId, myVideoStream, myCaptureMode, hideMyPhoto, audienceStreams }: SeatSelectionProps): JSX.Element {
  const seatsData: SeatData[] = seatLayout(0);

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
          occupantVideoStream={audienceStreams?.get(`a-${audienceSeats[seat.id]?.socketId}`) || audienceStreams?.get(audienceSeats[seat.id]?.name || '')}
          mySocketId={mySocketId}
          myVideoStream={myVideoStream}
          myCaptureMode={myCaptureMode}
          hideMyPhoto={hideMyPhoto}
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
  hideMyPhoto?: boolean;
  onSelect: (seatId: string) => void;
  allowSwitching?: boolean;
  hasSelectedSeat?: boolean;
}

function Seat({ seat, isSelected, isOccupied, occupantName, occupantImage, occupantSocketId, occupantCaptureMode, occupantVideoStream, mySocketId, myVideoStream, myCaptureMode, hideMyPhoto, onSelect, allowSwitching = true, hasSelectedSeat = false }: SeatProps): JSX.Element {
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

  // Velvet seats, brass for yours: free = velvet red, taken = deep oxblood.
  const occupiedByMe = isOccupied && occupantSocketId === mySocketId;
  const color = occupiedByMe || isSelected
    ? '#d4af37'
    : isOccupied
      ? '#4a0812'
      : '#9b1529';

  // Mobile-friendly seat size - larger for easier touch
  const seatSize = window.innerWidth < 768 ? 1.3 : 1; // Larger seats on mobile
  const nameTextSize = window.innerWidth < 768 ? 0.15 : 0.12; // Much smaller text to avoid obscuring view

  return (
    <group 
      position={seat.position} 
      rotation-y={-Math.atan2(seat.position[0], seat.position[2] - (-5))}
      name={seat.id}
    > {/* Rotate to face center/stage */}
      <group
        onPointerOver={(e) => {
          // Visual feedback on hover/touch
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'default';
        }}
        userData={{ onClick: handleClick, seatId: seat.id }}
      >
        {/* Seat cube at floor level */}
        <Box
          args={[seatSize, seatSize, seatSize]}
          position={[0, seatSize/2, 0]}
          castShadow={false}
          receiveShadow={false}
          onPointerDown={(e) => { e.stopPropagation(); handleClick(); }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'default'; }}
        >
          <meshBasicMaterial
            color={color}
            transparent={true}
            opacity={0.9}
          />
        </Box>
        
        {/* Add a subtle glow effect only for truly interactive seats */}
        {!isOccupied && !hasSelectedSeat && (
          <Box
            args={[seatSize * 1.1, seatSize * 1.1, seatSize * 1.1]}
            position={[0, 0, 0]}
          >
            <meshBasicMaterial
              color="#ffd66b"
              transparent={true}
              opacity={0.15}
            />
          </Box>
        )}
      </group>

      {/* Photo cube above seat - only for occupied seats, hidden for own seat in user view */}
      {isOccupied && !(occupiedByMe && hideMyPhoto) && (
        <PhotoCube
          key={`photo-${seat.id}-${occupantSocketId}`}
          imageUrl={occupantImage}
          videoStream={occupantSocketId === mySocketId ? myVideoStream : occupantVideoStream}
          captureMode={occupantSocketId === mySocketId ? myCaptureMode : occupantCaptureMode}
          position={[0, seatSize * 2, 0]}
          size={seatSize}
          opacity={0.9}
        />
      )}

      {/* The guest's name, always facing the viewer, above their seat */}
      {isOccupied && !(occupiedByMe && hideMyPhoto) && occupantName && (
        <Billboard position={[0, seatSize * 3.05, 0]}>
          <Text
            fontSize={nameTextSize * 2.6}
            color="#f6e3a1"
            outlineWidth={0.02}
            outlineColor="#140508"
            anchorX="center"
            anchorY="middle"
            maxWidth={3}
          >
            {occupantName}
          </Text>
        </Billboard>
      )}

      {/* Seat number painted on the floor in front of the seat */}
      <Text
        position={[0, 0.02, 0.9]}
        fontSize={0.32}
        color="#d4af37"
        anchorX="center"
        anchorY="middle"
        rotation-x={-Math.PI / 2}
      >
        {seatLabel(seat.id)}
      </Text>
    </group>
  );
}

export default SeatSelection;
