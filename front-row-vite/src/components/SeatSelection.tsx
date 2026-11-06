
import React from 'react';
import { Text, Box, Billboard } from '@react-three/drei';
import { ThreeEvent } from '@react-three/fiber';
import PhotoCube from './PhotoCube';
import type { SeatSpot } from '../lib/seatLayout';
import { useHouse } from '../theater/useHouse';
import type { HousePalette } from '../theater/theme';

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

type SeatData = SeatSpot;

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
  // The seat array and colors come from the theater's live screen (theater/house.tsx).
  const { seats: seatsData, palette } = useHouse();

  return (
    <group>
      {seatsData.map((seat) => (
        <Seat
          key={seat.id}
          seat={seat}
          palette={palette}
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
  palette: HousePalette;
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

function Seat({ seat, palette, isSelected, isOccupied, occupantName, occupantImage, occupantSocketId, occupantCaptureMode, occupantVideoStream, mySocketId, myVideoStream, myCaptureMode, hideMyPhoto, onSelect, allowSwitching = true, hasSelectedSeat = false }: SeatProps): JSX.Element {
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

  // Theme colors: free = the palette's seat (Front Row's velvet red), taken =
  // its darker shade, yours = the accent (brass).
  const occupiedByMe = isOccupied && occupantSocketId === mySocketId;
  const color = occupiedByMe || isSelected
    ? palette.accent
    : isOccupied
      ? palette.seatTaken
      : palette.seat;

  // Mobile-friendly seat size - larger for easier touch
  const seatSize = window.innerWidth < 768 ? 1.3 : 1; // Larger seats on mobile
  const nameTextSize = window.innerWidth < 768 ? 0.15 : 0.12; // Much smaller text to avoid obscuring view

  return (
    <group 
      position={seat.position} 
      rotation-y={seat.rotationY}
      name={seat.id}
    > {/* Faces the stage, or the middle of a round table (lib/seatLayout.ts) */}
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
              color={palette.marqueeGlow}
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
            color={palette.accentHi}
            outlineWidth={0.02}
            outlineColor={palette.houseBlack}
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
        color={palette.accent}
        anchorX="center"
        anchorY="middle"
        rotation-x={-Math.PI / 2}
      >
        {seat.label}
      </Text>
    </group>
  );
}

export default SeatSelection;
