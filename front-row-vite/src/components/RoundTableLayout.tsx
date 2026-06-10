import React from 'react';
import { Text } from '@react-three/drei';
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

interface RoundTableLayoutProps {
  numSeats: number;
  audienceSeats: AudienceSeats;
  selectedSeat: string | null;
  onSeatSelect: (seatId: string) => void;
  mySocketId?: string;
  myVideoStream?: MediaStream;
  myCaptureMode?: 'photo' | 'video';
  audienceStreams?: Map<string, MediaStream>;
}

const RADIUS = 6;
const MAX_SEATS = 20;
const DEFAULT_SEATS = 12;

interface SeatSpot {
  id: string;
  position: [number, number, number];
  rotAngle: number;
}

function computeSeatSpots(count: number): SeatSpot[] {
  const spots: SeatSpot[] = [];
  for (let i = 0; i < count; i++) {
    const posAngle = (i / count) * Math.PI * 2;
    const x = Math.cos(posAngle) * RADIUS;
    const z = Math.sin(posAngle) * RADIUS;
    const rotAngle = Math.PI / 2 - (i / count) * Math.PI * 2;
    spots.push({ id: `seat-${i}`, position: [x, 0, z], rotAngle });
  }
  return spots;
}

function RoundTableLayout({
  numSeats,
  audienceSeats,
  selectedSeat,
  onSeatSelect,
  mySocketId,
  myVideoStream,
  myCaptureMode,
  audienceStreams,
}: RoundTableLayoutProps): JSX.Element {
  const count = Math.max(1, Math.min(numSeats || DEFAULT_SEATS, MAX_SEATS));
  const spots = computeSeatSpots(count);

  return (
    <group name="round-table-layout">
      {/* Warm ambient lighting */}
      <ambientLight intensity={0.7} color="#ffe9cf" />
      <pointLight position={[0, 6, 0]} intensity={0.9} color="#ffd9a0" />
      <pointLight position={[0, 3, 8]} intensity={0.3} color="#ffffff" />

      {/* Center round table */}
      <mesh position={[0, 0, 0]} name="round-table">
        <cylinderGeometry args={[2, 2, 0.1, 48]} />
        <meshStandardMaterial color="#8B4513" roughness={0.6} metalness={0.1} />
      </mesh>

      {/* Floor */}
      <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[14, 64]} />
        <meshStandardMaterial color="#2a2a3a" roughness={0.9} />
      </mesh>

      {/* Seats */}
      {spots.map(({ id, position, rotAngle }) => {
        const occupant = audienceSeats[id];
        const isSelected = selectedSeat === id;
        const isMine = !!occupant && !!mySocketId && occupant.socketId === mySocketId;

        if (occupant) {
          let videoStream: MediaStream | undefined;
          if (isMine && myCaptureMode === 'video' && myVideoStream) {
            videoStream = myVideoStream;
          } else if (occupant.captureMode === 'video' && audienceStreams) {
            videoStream = audienceStreams.get(occupant.name);
          }
          const captureMode: 'photo' | 'video' = videoStream ? 'video' : 'photo';

          return (
            <group
              key={id}
              name={id}
              position={position}
              rotation={[0, rotAngle, 0]}
              onClick={(e) => {
                e.stopPropagation();
                if (isMine) onSeatSelect(id);
              }}
            >
              <PhotoCube
                imageUrl={occupant.imageUrl}
                videoStream={videoStream}
                captureMode={captureMode}
                position={[0, 0.6, 0]}
                size={1}
                color={isMine ? '#4CAF50' : 'blue'}
              />
              <Text
                position={[0, 1.45, 0]}
                fontSize={0.22}
                color={isMine ? '#4CAF50' : 'white'}
                anchorX="center"
                anchorY="middle"
              >
                {occupant.name}
              </Text>
            </group>
          );
        }

        // Vacant seat: glowing ring
        return (
          <group
            key={id}
            name={id}
            position={position}
            rotation={[0, rotAngle, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSeatSelect(id);
            }}
          >
            <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.35, 0.55, 32]} />
              <meshStandardMaterial
                color={isSelected ? '#ffd700' : '#44ccff'}
                emissive={isSelected ? '#ffd700' : '#2288cc'}
                emissiveIntensity={1.4}
                transparent
                opacity={0.85}
              />
            </mesh>
            {/* Invisible hit target so the ring is easy to click */}
            <mesh position={[0, 0.6, 0]} visible={false}>
              <boxGeometry args={[1, 1.2, 1]} />
              <meshBasicMaterial transparent opacity={0} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export default RoundTableLayout;
