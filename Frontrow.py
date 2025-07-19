import os
import base64
import subprocess
import sys
import time

# --- File Content Definitions (Base64 encoded to avoid formatting issues) ---
# Each string below represents the content of a file in your project.
# They will be decoded and written to the specified path by the script.

FILE_CONTENTS = {
    'front-row-app/package.json': base64.b64encode(b'''
{
  "name": "front-row-app",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "@react-three/drei": "^9.0.0",
    "@react-three/fiber": "^8.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-scripts": "5.0.1",
    "socket.io-client": "^4.0.0",
    "three": "^0.150.0",
    "webrtc-adapter": "^8.0.0"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  },
  "eslintConfig": {
    "extends": [
      "react-app",
      "react-app/jest"
    ]
  },
  "browserslist": {
    "production": [
      ">0.2%",
      "not dead",
      "not op_mini all"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version",
      "last 1 safari version"
    ]
  },
  "proxy": "http://localhost:3001"
}
''').decode('utf-8'),
    'front-row-app/src/App.js': base64.b64encode(b'''
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Html } from '@react-three/drei';
import { io } from 'socket.io-client';
import Stage from './components/Stage';
import SeatSelection from './components/SeatSelection';
import UserInputForm from './components/UserInputForm';
import PerformerView from './components/PerformerView';
import UserView from './components/UserView';
import LoadingScreen from './components/LoadingScreen';
import config from './config';
import './App.css';

// Define STUN servers directly in the frontend for WebRTC
// These are public STUN servers provided by Google.
const stunServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  // You might add more, or your own TURN server for truly robust connections
  // in complex network environments (e.g., behind strict firewalls),
  // but STUN is sufficient for many basic P2P setups.
];

function App() {
  const [userName, setUserName] = useState('');
  const [userImage, setUserImage] = useState(null); // Base64 or URL
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [showState, setShowState] = useState('pre-show'); // 'pre-show', 'live', 'post-show'
  const [currentView, setCurrentView] = useState('eye-in-the-sky'); // 'eye-in-the-sky', 'performer', 'user'
  const [performerStream, setPerformerStream] = useState(null); // MediaStream object for performer's video
  const [audienceSeats, setAudienceSeats] = useState({}); // { seatId: { name, imageUrl, socketId } }
  const socketRef = useRef(null);
  const localStreamRef = useRef(null); // For artist's local media stream
  const peerConnectionsRef = useRef({}); // { targetSocketId: RTCPeerConnection }
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  // --- Socket.IO and WebRTC Setup ---
  useEffect(() => {
    // Connect to backend Socket.IO server
    socketRef.current = io('http://localhost:3001'); // Adjust URL for deployment

    // Socket listeners for show status and seat updates
    socketRef.current.on('show-status-update', (data) => {
      console.log('Show Status Update:', data);
      setShowState(data.status);
      if (data.status === 'live') {
        // Start applause sound at end of show (20 minutes for performance + 2 min encore)
        setTimeout(() => {
          const applause = new Audio('/audio/applause.mp3'); // Assuming audio is in public folder
          applause.play();
        }, 22 * 60 * 1000); // 22 minutes (20 min performance + 2 min encore)
      }
    });

    socketRef.current.on('seat-update', (data) => {
      console.log('Seat Update:', data);
      setAudienceSeats(prev => {
        const newSeats = { ...prev };
        if (data.user) {
          newSeats[data.seatId] = data.user;
        } else {
          delete newSeats[data.seatId];
        }
        return newSeats;
      });
    });

    socketRef.current.on('all-seats-empty', () => {
      setAudienceSeats({});
    });

    // WebRTC Signaling listeners
    socketRef.current.on('offer', async (data) => {
        console.log('Received offer from:', data.offererSocketId);
        // Only audience members (non-artist) should process offers from artist
        // And only if they have a seat selected and don't already have a PC with this offerer
        if (!window.location.search.includes('role=artist') && selectedSeat && !peerConnectionsRef.current[data.offererSocketId]) {
            await setupAudiencePeerConnection(data.offererSocketId, data.sdp);
        }
    });

    socketRef.current.on('answer', async (data) => {
        console.log('Received answer from:', data.answererSocketId);
        const pc = peerConnectionsRef.current[data.answererSocketId];
        if (pc && pc.signalingState !== 'stable') { // Ensure not already stable
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        }
    });

    socketRef.current.on('ice-candidate', async (data) => {
        console.log('Received ICE candidate from:', data.senderSocketId);
        const pc = peerConnectionsRef.current[data.senderSocketId];
        if (pc && data.candidate) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
                console.error('Error adding received ICE candidate:', e);
            }
        }
    });

    // Listener for artist to know when new audience members join
    socketRef.current.on('new-audience-member', async (audienceSocketId) => {
        if (window.location.search.includes('role=artist')) { // Only artist should react to this
            console.log('Artist: New audience member joined:', audienceSocketId);
            // Artist initiates a new peer connection for this audience member
            const pc = new RTCPeerConnection({ iceServers: stunServers });
            peerConnectionsRef.current[audienceSocketId] = pc;

            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
            } else {
                console.warn('Artist: No local stream available to add to new peer connection.');
            }

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socketRef.current.emit('ice-candidate', {
                        candidate: event.candidate,
                        targetSocketId: audienceSocketId,
                        senderSocketId: socketRef.current.id,
                    });
                }
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socketRef.current.emit('offer', {
                sdp: offer,
                targetSocketId: audienceSocketId,
                offererSocketId: socketRef.current.id,
            });
        }
    });


    return () => {
      socketRef.current.disconnect();
      // Close all peer connections on unmount
      Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    };
  }, [selectedSeat]); // Re-run effect if seat selected, to initiate audience PC for artist

  // --- User Flow Functions ---
  const handleNameAndImageSubmit = async (name, imageBase64) => {
    setUserName(name);
    setUserImage(imageBase64);
    // User profile data is stored in-memory on backend via select-seat
  };

  const handleSeatSelect = async (seatId) => {
    if (!socketRef.current) return;

    // This is where the client requests a seat
    socketRef.current.emit('select-seat', { seatId, userName, userImage });

    // Listen for the seat-selected response only once per selection attempt
    const handleSeatSelectedResponse = (response) => {
        if (response.success) {
            setSelectedSeat(seatId);
            setCurrentView('user'); // Auto switch to user view after selecting seat
            console.log('Seat selected:', seatId);
        } else {
            alert(response.message);
        }
        socketRef.current.off('seat-selected', handleSeatSelectedResponse); // Remove listener
    };
    socketRef.current.on('seat-selected', handleSeatSelectedResponse);
  };

  const handleViewChange = (view) => {
    setCurrentView(view);
  };

  // --- WebRTC Functions ---
  const startPerformerStream = async () => {
    if (!socketRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setPerformerStream(stream); // Set stream for PerformerView to display local camera

      socketRef.current.emit('artist-go-live'); // Signal backend that artist is going live

    } catch (err) {
      console.error('Error starting performer stream:', err);
      alert('Could not start camera/microphone. Please check permissions.');
    }
  };

  const stopPerformerStream = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      setPerformerStream(null);
    }
    // Close all peer connections
    Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    peerConnectionsRef.current = {};
    if (socketRef.current) {
      socketRef.current.emit('artist-end-show');
    }
  };

  // Audience side setup for receiving artist's stream
  const setupAudiencePeerConnection = async (offererSocketId, offerSdp) => {
    const pc = new RTCPeerConnection({ iceServers: stunServers });
    peerConnectionsRef.current[offererSocketId] = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', {
          candidate: event.candidate,
          targetSocketId: offererSocketId,
          senderSocketId: socketRef.current.id,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('Audience received remote stream:', event.streams[0]);
      if (event.streams && event.streams[0]) {
        setPerformerStream(event.streams[0]); // This stream will be attached to the Stage component's video element
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socketRef.current.emit('answer', {
      sdp: answer,
      targetSocketId: offererSocketId,
      answererSocketId: socketRef.current.id,
    });
  };

  // --- Local Browser Recording ---
  const startRecording = (recordExperience = false) => {
    if (!performerStream && !recordExperience) { // If recording performance, need a stream
      alert("No live performance to record!");
      return;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        alert("Already recording!");
        return;
    }

    let streamToRecord;
    if (recordExperience) {
      // Capture the entire canvas
      const canvas = document.querySelector('canvas');
      if (!canvas) {
        alert("Canvas not found for experience recording.");
        return;
      }
      streamToRecord = canvas.captureStream(30); // 30 FPS
      // Add audio from the performer stream if available
      if (performerStream && performerStream.getAudioTracks().length > 0) {
        streamToRecord.addTrack(performerStream.getAudioTracks()[0]);
      } else {
        console.warn("No performer audio stream to add to experience recording.");
      }
    } else {
      // Record just the performer's stream
      streamToRecord = performerStream;
    }

    recordedChunksRef.current = [];
    try {
      mediaRecorderRef.current = new MediaRecorder(streamToRecord, { mimeType: 'video/webm; codecs=vp8,opus' }); // Prefer WebM with VP8
    } catch (e) {
      console.error('Error creating MediaRecorder with preferred codec, trying fallback:', e);
      // Fallback to less efficient codec if needed
      mediaRecorderRef.current = new MediaRecorder(streamToRecord, { mimeType: 'video/webm' });
    }


    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    mediaRecorderRef.current.onstop = () => {
      console.log('Recording stopped. Chunks:', recordedChunksRef.current.length);
      // The download button will become available
    };

    mediaRecorderRef.current.start();
    console.log('Recording started...');
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      console.log('Recording stopped via button.');
    } else {
        alert("No active recording to stop.");
    }
  };

  const downloadRecording = () => {
    if (recordedChunksRef.current.length === 0) {
      alert("No recording to download!");
      return;
    }
    const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    document.body.appendChild(a);
    a.style = 'display: none';
    a.href = url;
    a.download = `frontrow_recording_${new Date().toISOString()}.webm`;
    a.click();
    window.URL.revokeObjectURL(url);
    recordedChunksRef.current = []; // Clear chunks after download
  };

  const isPerformer = window.location.search.includes('role=artist'); // Simple check for artist role in Rev 1

  return (
    <div className="App">
      <Suspense fallback={<LoadingScreen />}>
        <Canvas camera={{ position: [0, 10, 15], fov: 50 }}>
          <Environment preset="city" />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />

          {currentView === 'eye-in-the-sky' && !selectedSeat && (
            <OrbitControls makeDefault />
          )}

          {selectedSeat && (currentView === 'user' || currentView === 'performer') && (
            // Disable orbit controls when in a fixed view
            <OrbitControls enabled={false} />
          )}

          <Stage config={config} showState={showState} performerStream={performerStream} />
          <SeatSelection
            selectedSeat={selectedSeat}
            onSeatSelect={handleSeatSelect}
            audienceSeats={audienceSeats}
          />

          {isPerformer && (
            <PerformerView performerStream={performerStream} />
          )}
          {!isPerformer && currentView === 'user' && (
            <UserView selectedSeat={selectedSeat} audienceSeats={audienceSeats} />
          )}
        </Canvas>
      </Suspense>

      {/* HTML Overlay for UI elements */}
      <Html fullscreen>
        <div className="ui-overlay">
          {/* Conditional rendering of UI components */}
          {!userName && !isPerformer && (
            <UserInputForm onSubmit={handleNameAndImageSubmit} />
          )}
          {userName && !selectedSeat && !isPerformer && (
            <div>
              <p>Welcome, {userName}! Pick your seat.</p>
            </div>
          )}
          {selectedSeat && !isPerformer && (
            <div className="controls">
              <button onClick={() => handleViewChange('eye-in-the-sky')}>Eye-in-the-Sky</button>
              <button onClick={() => handleViewChange('user')}>Your Seat View</button>
              {performerStream && ( // Only show record buttons if a stream is active
                <>
                  <button onClick={() => startRecording(false)}>Record Performance</button>
                  <button onClick={() => startRecording(true)}>Record My Experience</button>
                  <button onClick={stopRecording}>Stop Recording</button>
                </>
              )}
              {recordedChunksRef.current.length > 0 && (
                <button onClick={downloadRecording}>Download Recording</button>
              )}
            </div>
          )}

          {isPerformer && (
            <div className="performer-controls ui-overlay-bottom">
              {!performerStream ? (
                <button onClick={startPerformerStream}>Go Live</button>
              ) : (
                <button onClick={stopPerformerStream}>End Show</button>
              )}
               <button onClick={() => alert("Scheduling UI Not Implemented in Rev 1")}>Schedule Show (Future)</button>
            </div>
          )}

          {showState === 'pre-show' && (selectedSeat || isPerformer) && <div className="countdown">Show Starts Soon!</div>}
          {showState === 'live' && (selectedSeat || isPerformer) && <div className="live-indicator">LIVE</div>}
          {showState === 'post-show' && (selectedSeat || isPerformer) && <div className="thank-you">Thank You!</div>}
        </div>
      </Html>
    </div>
  );
}

export default App;
''').decode('utf-8'),
    'front-row-app/src/components/Stage.js': base64.b64encode(b'''
import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Plane, useVideoTexture } from '@react-three/drei';
import * as THREE from 'three';

function Stage({ config, showState, performerStream }) {
  const stageRef = useRef();
  const videoMaterialRef = useRef();

  // Create a video texture from the performer stream
  // This hook updates the texture automatically
  // Ensure performerStream is a MediaStream object for useVideoTexture
  const videoTexture = performerStream ? useVideoTexture(performerStream, {
    // Add these options to prevent WebGL warnings and ensure proper playback
    loop: false,
    muted: true, // Auto-play policies often require muted
    crossOrigin: 'anonymous', // For security if source is external
    start: true, // Start playback immediately
    playsInline: true // Crucial for mobile devices
  }) : null;


  // Animation for countdown or live indicator
  useFrame(() => {
    // Basic show state animation (e.g., pulsing live text)
    if (showState === 'live' && stageRef.current) {
      // Example: simple scale animation for a "LIVE" text
      // This text is now rendered in App.js HTML overlay for simplicity
    }
  });

  return (
    <group ref={stageRef}>
      {/* Stage floor */}
      <Plane args={[10, 6]} rotation-x={-Math.PI / 2} position={[0, 0.01, -5]}>
        <meshStandardMaterial color="gray" />
      </Plane>

      {/* Stage backdrop / Screen */}
      <Plane args={[10, 5]} position={[0, 2.5, -8]}>
        {videoTexture ? (
          // Use the video texture when stream is available
          <meshBasicMaterial toneMapped={false}>
            <primitive attach="map" object={videoTexture} />
          </meshBasicMaterial>
        ) : (
          // Fallback material when no stream (e.g., black screen)
          <meshBasicMaterial color="black" />
        )}
      </Plane>

      {/* Artist name stencil on stage floor */}
      <Text
        position={[0, 0.02, -4]}
        rotation-x={-Math.PI / 2}
        fontSize={0.8}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {config.artistName}
      </Text>

    </group>
  );
}

export default Stage;
''').decode('utf-8'),
    'front-row-app/src/components/SeatSelection.js': base64.b64encode(b'''
import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Text, Box, Html } from '@react-three/drei';
import * as THREE from 'three';

function SeatSelection({ selectedSeat, onSeatSelect, audienceSeats }) {
  const seatsData = [];
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

function Seat({ seat, isSelected, isOccupied, occupantName, occupantImage, onSelect }) {
  const meshRef = useRef();

  const handleClick = () => {
    if (!isOccupied && !isSelected) {
      onSelect(seat.id);
    }
  };

  const color = isOccupied ? 'darkred' : (isSelected ? 'gold' : 'blue');

  // Load image as a texture
  const texture = useRef();
  useEffect(() => {
    if (occupantImage) {
      const img = new Image();
      img.src = occupantImage;
      img.onload = () => {
        texture.current = new THREE.Texture(img);
        texture.current.needsUpdate = true;
        if (meshRef.current) {
            meshRef.current.material.map = texture.current;
            meshRef.current.material.needsUpdate = true;
        }
      };
    } else {
        texture.current = null; // Clear texture if no image
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
''').decode('utf-8'),
    'front-row-app/src/components/UserInputForm.js': base64.b64encode(b'''
import React, { useState } from 'react';

function UserInputForm({ onSubmit }) {
  const [name, setName] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result); // Base64 string for preview
      };
      reader.readAsDataURL(file);
    } else {
      setImageFile(null);
      setImagePreview(null);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name && imageFile) {
      // Pass the Base64 string from the preview for simplicity in Rev 1 in-memory
      onSubmit(name, imagePreview);
    } else {
      alert("Please enter your name and take a picture.");
    }
  };

  return (
    <div className="user-input-form">
      <form onSubmit={handleSubmit}>
        <h2>Join the Front Row</h2>
        <input
          type="text"
          placeholder="Your Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <label htmlFor="file-upload" className="custom-file-upload">
          {imagePreview ? 'Change Photo' : 'Take a Picture'}
        </label>
        <input
          id="file-upload"
          type="file"
          accept="image/*"
          capture="user" // Open front camera on mobile
          onChange={handleImageChange}
          required
          style={{ display: 'none' }}
        />
        {imagePreview && (
          <div className="image-preview-container">
            <img src={imagePreview} alt="User Preview" className="image-preview" />
          </div>
        )}
        <button type="submit">Enter FRONT ROW</button>
      </form>
    </div>
  );
}

export default UserInputForm;
''').decode('utf-8'),
    'front-row-app/src/components/PerformerView.js': base64.b64encode(b'''
import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text, Box } from '@react-three/drei';

function PerformerView({ performerStream }) {
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
''').decode('utf-8'),
    'front-row-app/src/components/UserView.js': base64.b64encode(b'''
import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Box, Text } from '@react-three/drei';
import * as THREE from 'three';

function UserView({ selectedSeat, audienceSeats }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3(0, 2.5, -8)); // Center of stage screen
  const up = useRef(new THREE.Vector3(0, 1, 0));

  const seatsData = [];
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
''').decode('utf-8'),
    'front-row-app/src/components/LoadingScreen.js': base64.b64encode(b'''
import React from 'react';
import { Html } from '@react-three/drei';
import './LoadingScreen.css'; // New CSS file for loading screen

function LoadingScreen() {
  return (
    <Html fullscreen>
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading FRONT ROW...</p>
      </div>
    </Html>
  );
}

export default LoadingScreen;
''').decode('utf-8'),
    'front-row-app/src/components/LoadingScreen.css': base64.b64encode(b'''
.loading-screen {
    position: absolute;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: #1a1a1a;
    color: white;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    font-family: 'Inter', sans-serif;
    z-index: 1000;
}

.spinner {
    border: 4px solid rgba(255, 255, 255, 0.3);
    border-top: 4px solid #fff;
    border-radius: 50%;
    width: 50px;
    height: 50px;
    animation: spin 1s linear infinite;
    margin-bottom: 20px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
''').decode('utf-8'),
    'front-row-app/src/config.js': base64.b64encode(b'''
const config = {
  artistName: "The Virtual Troubadour",
  // In Rev 1, artistImage is not dynamically used here as it's for user profiles.
  // This config is mostly for the static stage setup.
};

export default config;
''').decode('utf-8'),
    'front-row-app/src/App.css': base64.b64encode(b'''
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');

body {
  margin: 0;
  overflow: hidden;
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#root, .App {
  width: 100vw;
  height: 100vh;
  background-color: #000;
}

canvas {
  display: block;
}

.ui-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: white;
  font-family: 'Inter', sans-serif;
  pointer-events: none; /* Allows R3F interactions underneath */
  z-index: 10; /* Above canvas, below loading screen */
}

.ui-overlay > * {
  pointer-events: auto; /* Re-enable pointer events for specific UI elements */
}

.user-input-form, .controls, .performer-controls {
  background: rgba(0, 0, 0, 0.8);
  padding: 25px;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  max-width: 90%;
  margin: 20px;
}

.user-input-form h2 {
  color: #fff;
  margin-bottom: 20px;
  font-size: 1.8em;
}

.user-input-form input[type="text"],
.user-input-form button,
.controls button,
.performer-controls button {
  display: block;
  width: calc(100% - 20px);
  margin: 10px auto;
  padding: 12px 15px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background-color: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 1em;
  cursor: pointer;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.user-input-form input[type="text"]::placeholder {
  color: rgba(255, 255, 255, 0.7);
}

.user-input-form input[type="text"]:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25);
}

.custom-file-upload {
    display: inline-block;
    padding: 12px 15px;
    cursor: pointer;
    background-color: rgba(255, 255, 255, 0.1);
    color: white;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    margin: 10px auto;
    width: calc(100% - 20px);
    transition: background-color 0.3s ease;
}

.custom-file-upload:hover {
    background-color: rgba(255, 255, 255, 0.2);
}

.image-preview-container {
    margin-top: 15px;
    margin-bottom: 15px;
    text-align: center;
}

.image-preview {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid #007bff;
}

.countdown, .live-indicator, .thank-you {
  font-size: 2.5em;
  font-weight: bold;
  margin-top: 20px;
  text-shadow: 0 0 10px rgba(0, 123, 255, 0.5);
}

.live-indicator {
  color: #ff3b3b;
  animation: pulse 1.5s infinite alternate;
}

@keyframes pulse {
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0.7; transform: scale(1.05); }
}

.performer-controls {
  position: absolute;
  bottom: 20px;
  width: auto;
  min-width: 250px;
  display: flex;
  flex-direction: column;
}

.ui-overlay-bottom {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
}
''').decode('utf-8'),
    'front-row-app/public/index.html': base64.b64encode(b'''
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%PUBLIC_URL%/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta
      name="description"
      content="FRONT ROW: An intimate virtual theater experience."
    />
    <link rel="apple-touch-icon" href="%PUBLIC_URL%/logo192.png" />
    <link rel="manifest" href="%PUBLIC_URL%/manifest.json" />
    <title>FRONT ROW</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
''').decode('utf-8'),
    'front-row-app/public/audio/applause.mp3': base64.b64encode(b'// BASE64_ENCODED_MP3_HERE (Placeholder: In a real scenario, you\'d place a small applause MP3 here and base64 encode it. Or simply fetch from CDN.)').decode('utf-8'),
    'front-row-app/.gitignore': base64.b64encode(b'''
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# production
/build

# misc
.DS_Store
.env.local
.env.development.local
.env.test.local
.env.production.local

npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*
.pnpm-store

# editor
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
.idea
*.suo
*.ntvs*
*.njsproj
*.sln
*.vsix
*.map
*.bak

# Managed by Netlify CLI
.netlify/

# Local Supabase files
/supabase/.temp
/supabase/db/
/supabase/config.toml
''').decode('utf-8'),
    'server/package.json': base64.b64encode(b'''
{
  "name": "front-row-backend",
  "version": "1.0.0",
  "description": "Backend for FRONT ROW application (Rev 1: In-Memory)",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "socket.io": "^4.7.2"
  }
}
''').decode('utf-8'),
    'server/index.js': base64.b64encode(b'''
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // WARNING: For production, change to specific frontend URL (e.g., "https://your-front-row-app.netlify.app")
    methods: ["GET", "POST"]
  }
});

// --- IN-MEMORY STORES FOR REV 1 ---
// Data will be lost on server restart. Persistence is for Rev 2.
const scheduledShows = []; // { id, artistId, title, dateTime, status: 'scheduled' | 'live' | 'ended' }
const activeShow = {
  artistId: null,
  startTime: null,
  status: 'idle', // 'idle', 'pre-show', 'live', 'post-show'
  audienceSeats: {}, // { seatId: { name, imageUrl (base64 string), socketId } }
};
const userProfiles = {}; // { socketId: { name, imageUrl (base64 string), selectedSeat } } // Temporary store for connected users

// --- API Routes ---
app.use(cors());
app.use(express.json({ limit: '5mb' })); // Allows larger JSON bodies for Base64 image strings

// Get all scheduled shows
app.get('/api/shows', (req, res) => {
  res.json(scheduledShows);
});

// Artist schedules a new show (in-memory)
app.post('/api/shows', (req, res) => {
  const { artistId, title, dateTime } = req.body;
  if (!artistId || !title || !dateTime) {
      return res.status(400).json({ error: 'Missing required fields: artistId, title, dateTime' });
  }
  const newShow = { id: Date.now().toString(), artistId, title, dateTime, status: 'scheduled' };
  scheduledShows.push(newShow);
  io.emit('shows-updated', scheduledShows); // Notify all clients about updated schedule
  res.status(201).json(newShow);
  console.log(`New show scheduled: ${title} by ${artistId} at ${dateTime}`);
});

// Placeholder for artist to signal going live or ending show via API (for testing)
app.post('/api/artist-simulate-live', (req, res) => {
    // In a real scenario, this would come from an authenticated artist client
    if (activeShow.status !== 'idle' && activeShow.status !== 'pre-show') { // Allow from pre-show for testing
      return res.status(400).json({ error: 'Show already active or in invalid state.' });
    }
    activeShow.status = 'live';
    activeShow.artistId = 'simulated-artist'; // Placeholder ID
    activeShow.startTime = Date.now();
    io.emit('show-status-update', { status: 'live', artistId: activeShow.artistId });
    console.log('Simulated artist going LIVE!');
    res.status(200).json({ status: 'live' });
});

app.post('/api/artist-simulate-end', (req, res) => {
    if (activeShow.status !== 'live') {
      return res.status(400).json({ error: 'No active show to end.' });
    }
    activeShow.status = 'post-show';
    io.emit('show-status-update', { status: 'post-show' });
    console.log('Simulated artist ending show.');
    res.status(200).json({ status: 'post-show' });
    // Reset after a short delay
    setTimeout(() => {
        // Clear audience seats
        for (const seatId in activeShow.audienceSeats) {
            delete activeShow.audienceSeats[seatId];
        }
        // Clear user profiles
        for (const socketId in userProfiles) {
            delete userProfiles[socketId];
        }
        io.emit('all-seats-empty');
        activeShow.status = 'idle';
        console.log('Show cycle reset to idle after post-show.');
    }, 5000); // 5 seconds post-show display
});


// --- Socket.IO for WebRTC Signaling and Real-time Updates ---
io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

  // WebRTC Signaling: Relays messages between peers
  socket.on('offer', (data) => {
    // Data: { sdp, targetSocketId } (offerer is socket.id)
    if (data.targetSocketId && io.sockets.sockets.has(data.targetSocketId)) {
        console.log(`Relaying offer from ${socket.id} to ${data.targetSocketId}`);
        io.to(data.targetSocketId).emit('offer', { sdp: data.sdp, offererSocketId: socket.id });
    } else {
        console.warn(`Offer target ${data.targetSocketId} not found or invalid.`);
    }
  });

  socket.on('answer', (data) => {
    // Data: { sdp, targetSocketId } (answerer is socket.id)
    if (data.targetSocketId && io.sockets.sockets.has(data.targetSocketId)) {
        console.log(`Relaying answer from ${socket.id} to ${data.targetSocketId}`);
        io.to(data.targetSocketId).emit('answer', { sdp: data.sdp, answererSocketId: socket.id });
    } else {
        console.warn(`Answer target ${data.targetSocketId} not found or invalid.`);
    }
  });

  socket.on('ice-candidate', (data) => {
    // Data: { candidate, targetSocketId } (sender is socket.id)
    if (data.targetSocketId && io.sockets.sockets.has(data.targetSocketId)) {
        console.log(`Relaying ICE candidate from ${socket.id} to ${data.targetSocketId}`);
        io.to(data.targetSocketId).emit('ice-candidate', { candidate: data.candidate, senderSocketId: socket.id });
    } else {
        console.warn(`ICE candidate target ${data.targetSocketId} not found or invalid.`);
    }
  });

  // Audience seat management (in-memory)
  socket.on('select-seat', (data) => {
    const { seatId, userName, userImage } = data;
    if (activeShow.audienceSeats[seatId]) {
      socket.emit('seat-selected', { success: false, message: 'Seat already taken' });
      return;
    }
    if (Object.keys(activeShow.audienceSeats).length >= 9) { // Cap at 9 front-row seats
      socket.emit('seat-selected', { success: false, message: 'Front row is full!' });
      return;
    }

    // Assign seat and store profile in-memory
    activeShow.audienceSeats[seatId] = { name: userName, imageUrl: userImage, socketId: socket.id };
    userProfiles[socket.id] = { name: userName, imageUrl: userImage, selectedSeat: seatId };

    io.emit('seat-update', { seatId, user: { name: userName, imageUrl: userImage, socketId: socket.id } }); // Notify all clients of new occupant
    socket.emit('seat-selected', { success: true, seatId });
    console.log(`User ${userName} selected seat ${seatId}`);

    // If an artist is already live, immediately send them an offer to this new audience member
    if (activeShow.status === 'live' && activeShow.artistId) {
        // Signal the artist (activeShow.artistId) that a new audience member has joined
        io.to(activeShow.artistId).emit('new-audience-member', socket.id);
        console.log(`Signaling artist ${activeShow.artistId} about new audience ${socket.id}`);
    }
  });

  socket.on('leave-seat', () => {
    const userData = userProfiles[socket.id];
    if (userData && userData.selectedSeat) {
      delete activeShow.audienceSeats[userData.selectedSeat];
      io.emit('seat-update', { seatId: userData.selectedSeat, user: null }); // Null user means seat is empty
      delete userData.selectedSeat;
      console.log(`User ${userData.name} left seat ${userData.selectedSeat}`);
    }
  });

  // Artist controls
  // Artist will call socket.emit('artist-go-live') from frontend to initiate stream setup
  // and handle WebRTC peer connection creation for each audience member.
  // The backend primarily orchestrates the signaling and broadcast of status.
  socket.on('artist-go-live', () => {
    if (activeShow.status !== 'idle' && activeShow.status !== 'pre-show') {
      console.warn('Artist tried to go live when show is not idle/pre-show.');
      return;
    }
    activeShow.status = 'live';
    activeShow.artistId = socket.id; // The socket that sent 'artist-go-live' is the artist
    activeShow.startTime = Date.now();
    io.emit('show-status-update', { status: 'live', artistId: socket.id });
    console.log(`Artist ${socket.id} is now LIVE!`);

    // Notify all *currently seated* audience members to set up peer connection with artist
    // Artist's frontend will generate offers to these
    Object.values(activeShow.audienceSeats).forEach(audience => {
        io.to(audience.socketId).emit('new-audience-member', socket.id);
        console.log(`Notifying seated audience ${audience.socketId} about artist ${socket.id} going live.`);
    });
  });

  socket.on('artist-end-show', () => {
    if (activeShow.status !== 'live') {
      console.warn('Artist tried to end show when no show is live.');
      return;
    }
    activeShow.status = 'post-show';
    io.emit('show-status-update', { status: 'post-show' });
    console.log(`Artist ${socket.id} has ended the show.`);
    activeShow.artistId = null; // Clear artist
    activeShow.startTime = null;

    // Reset after a short delay for post-show message display
    setTimeout(() => {
        // Clear audience seats
        for (const seatId in activeShow.audienceSeats) {
            delete activeShow.audienceSeats[seatId];
        }
        // Clear user profiles
        for (const socketId in userProfiles) {
            delete userProfiles[socketId];
        }
        io.emit('all-seats-empty');
        activeShow.status = 'idle';
        console.log('Show cycle reset to idle after post-show.');
    }, 5000); // 5 seconds post-show display
  });


  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
    // Remove user's seat on disconnect
    const userData = userProfiles[socket.id];
    if (userData && userData.selectedSeat) {
      delete activeShow.audienceSeats[userData.selectedSeat];
      io.emit('seat-update', { seatId: userData.selectedSeat, user: null });
    }
    delete userProfiles[socket.id]; // Remove profile from in-memory store
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
''').decode('utf-8'),
    'server/config.js': base64.b64encode(b'''
const backendConfig = {
  // Public STUN servers for WebRTC NAT traversal.
  // These are crucial for direct peer-to-peer connections to work.
  stunServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    // You might add more, or your own TURN server for truly robust connections
    // in complex network environments (e.g., behind strict firewalls),
    // but STUN is sufficient for many basic P2P setups.
  ],
};

module.exports = backendConfig;
''').decode('utf-8'),
    'tests/auto_test.py': base64.b64encode(b'''
import asyncio
from playwright.async_api import async_playwright, expect
import requests # For backend API calls
import json
import time
import sys

APP_URL = 'http://localhost:3000' # Frontend URL
BACKEND_URL = 'http://localhost:3001' # Backend URL

async def run_test():
    print("--- Starting FRONT ROW auto-test ---")
    async with async_playwright() as p:
        # Launch browser with CDP enabled for debugging
        # headless=False allows you to visually watch the test.
        browser = await p.chromium.launch(headless=False, devtools=True)
        # For connecting to an MCP server for ad-hoc debugging:
        # browser = await p.chromium.connect("ws://your-mcp-server-address:port/path/to/websocket")

        audience_pages = [] # To keep track of all audience pages for cleanup

        try:
            # --- Scenario 0: Backend Setup (Simulate Artist Scheduling for UI) ---
            print("\n--- Backend Setup: Scheduling a Show ---")
            artist_id = "test-artist-1"
            show_title = "My Debut Performance"
            show_time = "2025-07-20T20:00:00Z" # UTC time
            schedule_response = requests.post(f"{BACKEND_URL}/api/shows", json={
                "artistId": artist_id,
                "title": show_title,
                "dateTime": show_time
            })
            expect(schedule_response.status_code).to_be(201)
            print(f"  Backend: Scheduled show '{show_title}'.")

            # --- Scenario 1: Artist Joins and Prepares ---
            print("\n--- Scenario 1: Artist Prepares ---")
            # Create a dedicated context for the artist to manage permissions
            artist_context = await browser.new_context()
            await artist_context.grant_permissions(['microphone', 'camera'])
            page_artist = await artist_context.new_page()
            print("  Artist: Navigating to app as artist...")
            await page_artist.goto(APP_URL + '?role=artist') # Use query param for artist role
            await page_artist.wait_for_selector('.performer-controls button:has-text("Go Live")', timeout=10000)
            print("  Artist: Performer controls visible.")
            await asyncio.sleep(1) # Visual pause

            # --- Scenario 2: Multiple Audience Members Join and Select Seats ---
            print("\n--- Scenario 2: Audience Members Join ---")
            num_audience_members = 9 # Test all 9 front row seats

            for i in range(num_audience_members):
                print(f"  Audience {i+1}: Joining...")
                page_audience = await browser.new_page()
                await page_audience.goto(APP_URL)
                await page_audience.wait_for_selector('.user-input-form', timeout=10000)

                # Simulate User Input (name and a dummy image)
                dummy_image_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
                # Simulate the form submission by executing JS that fills the form
                await page_audience.evaluate(f'''(name, img_b64) => {{
                    const nameInput = document.querySelector('input[type="text"]');
                    const fileInput = document.querySelector('input[type="file"]');
                    const form = document.querySelector('.user-input-form form');
                    nameInput.value = name;

                    // Create a dummy File object from base64
                    // Note: Playwright's set_input_files is more robust for actual files.
                    // This JS eval approach is for demonstrating in-browser file selection.
                    const byteCharacters = atob(img_b64.split(',')[1]);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {{
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }}
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], {{ type: 'image/png' }});
                    const file = new File([blob], 'dummy.png', {{ type: 'image/png' }});

                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    fileInput.files = dataTransfer.files;

                    // Trigger change events to update React state
                    const nameChangeEvent = new Event('input', {{ bubbles: true }});
                    const fileChangeEvent = new Event('change', {{ bubbles: true }});
                    nameInput.dispatchEvent(nameChangeEvent);
                    fileInput.dispatchEvent(fileChangeEvent);

                    // Submit the form
                    const submitButton = form.querySelector('button[type="submit"]');
                    submitButton.click();
                }}''', f'Test User {i+1}', dummy_image_b64)
                print(f"  Audience {i+1}: Name and dummy image submitted.")

                await page_audience.wait_for_selector('.ui-overlay:has-text("Pick your seat")', timeout=10000)
                print(f"  Audience {i+1}: Prompted to pick seat.")

                # Test: Seat Selection
                await page_audience.locator(f'.seat-box').nth(i).click() # Click a distinct seat
                await page_audience.wait_for_selector('.controls', timeout=10000)
                print(f"  Audience {i+1}: Seat selected, now in User View.")
                audience_pages.append(page_audience)
                await asyncio.sleep(0.5) # Small pause between users joining

            await asyncio.sleep(2) # Allow all camera transitions to settle

            # --- Scenario 3: Artist Starts Show ---
            print("\n--- Scenario 3: Artist Starts Show ---")
            # Artist 'Go Live'
            print("  Artist: Clicking 'Go Live'...")
            await page_artist.click('.performer-controls button:has-text("Go Live")')
            print("  Artist: 'Go Live' clicked. Waiting for WebRTC setup...")
            await asyncio.sleep(5) # Give time for WebRTC to establish

            # Verify show status updates on audience pages
            for i, page_aud in enumerate(audience_pages):
                print(f"  Audience {i+1}: Verifying 'LIVE' indicator...")
                await expect(page_aud.locator('.live-indicator')).to_be_visible(timeout=10000)
                print(f"  Audience {i+1}: 'LIVE' indicator visible.")
                # Verify video element for performer stream is present and possibly playing
                # This is tricky with Playwright. You might need to check network requests
                # or evaluate JS to check video.readyState (e.g., readyState === 4 for HAVE_ENOUGH_DATA)
                # Check if the video element within the canvas is present
                await page_aud.wait_for_selector('canvas video', timeout=15000)
                print(f"  Audience {i+1}: Video element for performer stream detected on stage.")
            await asyncio.sleep(5) # Watch the "live" show for a bit

            # --- Scenario 4: Audience Member View Switching ---
            print("\n--- Scenario 4: Audience Member View Switching ---")
            test_page_aud = audience_pages[0] # Pick first audience member for view tests

            # Test: User View to Eye-in-the-Sky
            print("  Audience (Test User 1): Switching to Eye-in-the-Sky view...")
            await test_page_aud.click('button:has-text("Eye-in-the-Sky")')
            await asyncio.sleep(2) # Allow camera transition
            print("  Audience (Test User 1): Switched to Eye-in-the-Sky.")

            # Test: Switching back to User View
            print("  Audience (Test User 1): Switching back to Your Seat View...")
            await test_page_aud.click('button:has-text("Your Seat View")')
            await asyncio.sleep(2) # Allow camera transition
            print("  Audience (Test User 1): Switched back to Your Seat View.")

            # --- Scenario 5: Local Recording (Audience side) ---
            print("\n--- Scenario 5: Local Recording (Audience) ---")
            print("  Audience (Test User 1): Starting local recording (Performance only)...")
            await test_page_aud.click('button:has-text("Record Performance")')
            await asyncio.sleep(3) # Record for a few seconds
            print("  Audience (Test User 1): Stopping local recording...")
            await test_page_aud.click('button:has-text("Stop Recording")')
            await expect(test_page_aud.locator('button:has-text("Download Recording")')).to_be_visible(timeout=5000)
            print("  Audience (Test User 1): Download button available. (Manual download verification needed)")
            # Note: Playwright doesn't directly support triggering file downloads from data URLs
            # or verifying file content for security reasons. This step is for UI presence.

            # --- Scenario 6: Artist Ends Show ---
            print("\n--- Scenario 6: Artist Ends Show ---")
            print("  Artist: Clicking 'End Show'...")
            await page_artist.click('.performer-controls button:has-text("End Show")')
            print("  Artist: 'End Show' clicked.")
            await asyncio.sleep(2) # Wait for signal to propagate

            # Verify show end animation on audience pages
            for i, page_aud in enumerate(audience_pages):
                print(f"  Audience {i+1}: Verifying 'Thank You' screen...")
                await expect(page_aud.locator('.thank-you')).to_be_visible(timeout=10000)
                print(f"  Audience {i+1}: 'Thank You' screen visible.")
            await asyncio.sleep(5) # Allow post-show display

            print("\n--- FRONT ROW auto-test completed successfully! ---")

        except Exception as e:
            print(f"\n--- Auto-test FAILED: {e} ---")
            # Capture screenshots on failure for debugging
            timestamp = time.strftime("%Y%m%d-%H%M%S")
            await page_artist.screenshot(path=f"test_failure_artist_{timestamp}.png")
            for i, page_aud in enumerate(audience_pages):
                await page_aud.screenshot(path=f"test_failure_audience_{i+1}_{timestamp}.png")
            raise # Re-raise the exception to indicate test failure
        finally:
            print("Closing all browser contexts...")
            await browser.close()
            print("All browser contexts closed.")

if __name__ == '__main__':
    asyncio.run(run_test())
''').decode('utf-8'),
    'tests/backend_api_in_memory.py': base64.b64encode(b'''
import requests
import json
import asyncio
from playwright.async_api import async_playwright, expect
from socketio import AsyncClient as AsyncSocketIOClient # For testing Socket.IO events
import sys # Import sys for sys.exit

BACKEND_URL = 'http://localhost:3001'

async def test_backend_api_in_memory():
    print("\n--- Backend API In-Memory Tests ---")

    # Ensure backend is running and accessible
    try:
        response = requests.get(f"{BACKEND_URL}/api/shows")
        expect(response.status_code).to_be(200)
        print("  Backend is accessible.")
    except requests.exceptions.ConnectionError:
        print("  Backend is not running. Please start the backend server before running tests.")
        sys.exit(1)

    # Test 1: GET /api/shows (initially empty)
    print("  Test 1: GET /api/shows (initially empty)")
    response = requests.get(f"{BACKEND_URL}/api/shows")
    expect(response.json()).to_be([])
    print("    -> Passed: Shows list is initially empty.")

    # Test 2: POST /api/shows (add a show)
    print("  Test 2: POST /api/shows (add a show)")
    new_show_data = {
        "artistId": "test-artist-id-123",
        "title": "My Test Show",
        "dateTime": "2025-07-20T19:00:00Z"
    }
    response = requests.post(f"{BACKEND_URL}/api/shows", json=new_show_data)
    expect(response.status_code).to_be(201)
    created_show = response.json()
    expect(created_show['title']).to_be("My Test Show")
    print(f"    -> Passed: Show '{created_show['title']}' added successfully.")

    # Test 3: GET /api/shows (contains the added show)
    print("  Test 3: GET /api/shows (contains the added show)")
    response = requests.get(f"{BACKEND_URL}/api/shows")
    shows = response.json()
    expect(len(shows)).to_be(1)
    expect(shows[0]['title']).to_be("My Test Show")
    print("    -> Passed: Shows list now contains the added show.")

    # Test 4: Socket.IO - Connect and Receive `shows-updated`
    print("  Test 4: Socket.IO - Connect and Receive `shows-updated`")
    sio = AsyncSocketIOClient()
    received_shows_update = asyncio.Event()
    updated_shows_data = None

    @sio.event
    def connect():
        print("    Socket.IO client connected.")

    @sio.event
    def shows_updated(data):
        nonlocal updated_shows_data
        updated_shows_data = data
        received_shows_update.set()
        print("    Received 'shows-updated' event.")

    await sio.connect(BACKEND_URL)
    await asyncio.sleep(0.1) # Give time for connect event

    # Trigger another show addition to ensure event is fired
    requests.post(f"{BACKEND_URL}/api/shows", json={
        "artistId": "test-artist-id-456",
        "title": "Another Test Show",
        "dateTime": "2025-07-21T20:00:00Z"
    })

    try:
        await asyncio.wait_for(received_shows_update.wait(), timeout=5)
        expect(len(updated_shows_data)).to_be(2)
        expect(updated_shows_data[1]['title']).to_be("Another Test Show")
        print("    -> Passed: 'shows-updated' event received and data is correct.")
    except asyncio.TimeoutError:
        print("    -> FAILED: 'shows-updated' event not received in time.")
        raise
    finally:
        await sio.disconnect()

    # Test 5: Socket.IO - Seat Selection and `seat-update` broadcast
    print("  Test 5: Socket.IO - Seat Selection and `seat-update` broadcast")
    sio1 = AsyncSocketIOClient() # User 1
    sio2 = AsyncSocketIOClient() # User 2 (to receive broadcast)
    seat_update_received_by_sio2 = asyncio.Event()
    received_seat_data = None

    @sio2.event
    def seat_update(data):
        nonlocal received_seat_data
        received_seat_data = data
        seat_update_received_by_sio2.set()
        print("    User 2 received 'seat-update' event.")

    await sio1.connect(BACKEND_URL)
    await sio2.connect(BACKEND_URL)
    await asyncio.sleep(0.1) # Give time to connect

    sio1.emit('select-seat', {'seatId': 'seat-0', 'userName': 'TestUserA', 'userImage': 'data:image/png;base64,abc'})

    try:
        await asyncio.wait_for(seat_update_received_by_sio2.wait(), timeout=5)
        expect(received_seat_data['seatId']).to_be('seat-0')
        expect(received_seat_data['user']['name']).to_be('TestUserA')
        print("    -> Passed: 'seat-update' event received by other client.")
    except asyncio.TimeoutError:
        print("    -> FAILED: 'seat-update' event not received in time.")
        raise
    finally:
        await sio1.disconnect()
        await sio2.disconnect()

    # Test 6: Socket.IO - Artist Go Live / End Show
    print("  Test 6: Socket.IO - Artist Go Live / End Show")
    artist_sio = AsyncSocketIOClient()
    audience_sio = AsyncSocketIOClient()
    go_live_event = asyncio.Event()
    end_show_event = asyncio.Event()
    show_status_data = None

    @audience_sio.event
    def show_status_update(data):
        nonlocal show_status_data
        show_status_data = data
        if data['status'] == 'live':
            go_live_event.set()
        elif data['status'] == 'post-show':
            end_show_event.set()
        print(f"    Audience received show-status-update: {data['status']}")

    await artist_sio.connect(BACKEND_URL)
    await audience_sio.connect(BACKEND_URL)
    await asyncio.sleep(0.1) # Give time to connect

    # Simulate artist going live
    artist_sio.emit('artist-go-live')
    try:
        await asyncio.wait_for(go_live_event.wait(), timeout=5)
        expect(show_status_data['status']).to_be('live')
        print("    -> Passed: Artist 'go-live' signal received by audience.")
    except asyncio.TimeoutError:
        print("    -> FAILED: Artist 'go-live' signal not received.")
        raise

    # Simulate artist ending show
    artist_sio.emit('artist-end-show')
    try:
        await asyncio.wait_for(end_show_event.wait(), timeout=5)
        expect(show_status_data['status']).to_be('post-show')
        print("    -> Passed: Artist 'end-show' signal received by audience.")
    except asyncio.TimeoutError:
        print("    -> FAILED: Artist 'end-show' signal not received.")
        raise
    finally:
        await artist_sio.disconnect()
        await audience_sio.disconnect()

    print("\n--- All Backend API In-Memory Tests Passed ---")

if __name__ == '__main__':
    asyncio.run(test_backend_api_in_memory())
''').decode('utf-8'),
    'README.md': base64.b64encode(b'''
# FRONT ROW: Rev 1

Welcome to FRONT ROW, your intimate virtual theater experience!

This is the first iteration (Rev 1) of the FRONT ROW application, focusing on core functionality:
* An interactive 3D virtual theater built with React Three Fiber.
* Live, low-latency musical performances from artists via direct WebRTC.
* Audience members can join, provide their name and a picture, and select a front-row seat.
* Real-time updates on seat occupancy.
* Artist-controlled show scheduling (in-memory for Rev 1).
* Browser-based local recording of performances or the full user experience.

## Getting Started (Developer Setup)

This project is managed by a self-expanding Python installer script. Follow these steps to set up your development environment.

**1. Run the Installer Script:**

   ```bash
   python front_row_installer.py
   ```
   Follow the prompts. This script will:
   * Create the project directory structure.
   * Write all necessary files.
   * Install Node.js dependencies using `pnpm`.
   * Install Python (Playwright) dependencies.
   * Guide you through Netlify CLI and Supabase CLI authentication for future deployment.

**2. Start the Backend Server:**

   Navigate to the `server` directory and start the Node.js backend.
   ```bash
   cd server
   npm install # Or pnpm install, if you prefer
   npm start
   ```
   The backend will run on `http://localhost:3001`. Keep this terminal open.

**3. Start the Frontend Application:**

   Navigate to the `front-row-app` directory and start the React development server.
   ```bash
   cd front-row-app
   npm install # Or pnpm install
   npm start
   ```
   The frontend will run on `http://localhost:3000`. Your browser should automatically open.

## Running Tests

Tests are written in Python using Playwright.

**1. Run Backend API Tests (Unit/Integration):**

   These tests verify the in-memory backend API and WebSocket signaling.
   ```bash
   python tests/backend_api_in_memory.py
   ```

**2. Run Frontend End-to-End Auto-Tests:**

   These tests simulate user interactions in a browser. They require the frontend (`npm start`) and backend (`npm start`) servers to be running.
   ```bash
   python tests/auto_test.py
   ```
   * **To watch tests run:** The script will launch a non-headless browser instance by default.
   * **Debugging with CDP:** If you need to connect Chrome DevTools, open a new browser window/tab in Chrome and go to `chrome://inspect`. You should see the Playwright-controlled browser instance there.

## Future Deployment (Beyond Rev 1)

This project is set up for easy future deployment.

### Frontend (Netlify)

1.  **Connect to GitHub:** Push your `front-row-app` directory to a new GitHub repository.
2.  **Netlify Setup:** Go to [Netlify](https://app.netlify.com/), click "Add new site" -> "Import an existing project" -> "Deploy with GitHub".
3.  **Select Repo:** Choose your `front-row-app` repository.
4.  **Build Settings:** Netlify should auto-detect React. Ensure build command is `npm run build` (or `pnpm run build`) and publish directory is `build`.
5.  **Deploy:** Click "Deploy site". Subsequent pushes to your GitHub repo will automatically trigger new Netlify deployments.

### Backend (Node.js Server)

For Rev 1's simple Node.js backend, you can deploy it to services like Render, Fly.io, or even a basic VPS.

1.  **Push to GitHub:** Push your `server` directory to a new GitHub repository (or a sub-directory of your main repo).
2.  **Choose Hosting Provider:**
    * **Render.com:** Easiest for Node.js. Connect your GitHub repo, set build command to `npm install` (or `pnpm install`) and start command to `npm start`.
    * **Fly.io / Heroku:** Similar setup, involving app creation and linking to GitHub.
3.  **Environment Variables:** Remember to configure `PORT` (e.g., `8080`) and any other necessary environment variables (like STUN/TURN server URLs if you move beyond public ones) directly in your hosting provider's dashboard, NOT in your code.
4.  **Update Frontend Proxy:** Once your backend is deployed, update the `proxy` entry in `front-row-app/package.json` and the `io()` URL in `front-row-app/src/App.js` to point to your live backend URL.

### Database (Supabase - For Rev 2 and beyond)

For future persistence (Rev 2), you can integrate Supabase.

1.  **Supabase Project:** Go to [Supabase](https://app.supabase.com/) and create a new project.
2.  **Schema Design:** Design your database schema (e.g., for `shows`, `artists`, `users`).
3.  **Integrate Client Libraries:** Use `@supabase/supabase-js` in your React frontend and potentially `supabase-js` or direct HTTP calls in your Node.js backend to interact with your Supabase project.
4.  **Secrets:** Store your Supabase Project URL and Anon Key securely as environment variables in your Netlify/backend hosting settings, not in your code.

## Development Utilities

* `./run_backend.sh`: Simple script to launch the backend.
* `./run_frontend.sh`: Simple script to launch the frontend.
* `./run_all_tests.sh`: Simple script to run all tests.

---
''').decode('utf-8'),
    'run_backend.sh': base64.b64encode(b'''
#!/bin/bash
echo "Starting backend server..."
cd server
npm install # Ensure dependencies are installed (or pnpm install)
npm start
''').decode('utf-8'),
    'run_frontend.sh': base64.b64encode(b'''
#!/bin/bash
echo "Starting frontend development server..."
cd front-row-app
npm install # Ensure dependencies are installed (or pnpm install)
npm start
''').decode('utf-8'),
    'run_all_tests.sh': base64.b64encode(b'''
#!/bin/bash
echo "Running all backend API tests..."
python tests/backend_api_in_memory.py || exit 1 # Exit if backend tests fail

echo "Running all frontend auto-tests (requires frontend & backend to be running)..."
python tests/auto_test.py
''').decode('utf-8'),
    '.gitignore': base64.b64encode(b'''
# Global .gitignore for the entire project
# Folders created by the installer
/front-row-app/node_modules
/front-row-app/build
/server/node_modules
/tests/node_modules
/tests/__pycache__
/tests/.pytest_cache
# Python specific
*.pyc
.mypy_cache/
.pytest_cache/
.venv/
# Environment variables (should not be committed)
.env
''').decode('utf-8'),
    '.env.example': base64.b64encode(b'''
# Example .env file for local development (copy to .env and fill in)

# Frontend
REACT_APP_BACKEND_URL=http://localhost:3001

# Backend (for future use/if using local Supabase, etc.)
PORT=3001
# SUPABASE_URL=
# SUPABASE_ANON_KEY=

# STUN/TURN servers for WebRTC (if you host your own, or need specific ones)
# STUN_SERVER_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
''').decode('utf-8'),
    '.netlify.toml': base64.b64encode(b'''
[build]
  publish = "front-row-app/build"
  command = "npm --prefix ./front-row-app install && npm --prefix ./front-row-app run build"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
''').decode('utf-8'),
    # Add an empty supabase directory structure for `supabase init`
    'supabase/.gitkeep': base64.b64encode(b'').decode('utf-8'),
}

# --- Script Logic ---

def create_file(filepath, content_base64, is_executable=False):
    """Decodes base64 content and writes it to a file, makes it executable if specified."""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    try:
        content = base64.b64decode(content_base64)
        with open(filepath, 'wb') as f:
            f.write(content)
        if is_executable:
            os.chmod(filepath, 0o755) # rwxr-xr-x
        print(f"  Created: {filepath}")
    except Exception as e:
        print(f"Error creating {filepath}: {e}")
        sys.exit(1)

def run_command(command, cwd=None, check=True):
    """Runs a shell command, prints output, and checks for errors."""
    print(f"\nExecuting: {' '.join(command)}")
    try:
        process = subprocess.run(command, cwd=cwd, check=check, text=True, capture_output=True)
        print(process.stdout)
        if process.stderr:
            print(f"STDERR:\n{process.stderr}")
        return process
    except subprocess.CalledProcessError as e:
        print(f"Command failed with error code {e.returncode}")
        print(f"STDOUT:\n{e.stdout}")
        print(f"STDERR:\n{e.stderr}")
        sys.exit(e.returncode)
    except FileNotFoundError:
        print(f"Error: Command not found. Make sure {' '.join(command[:1])} is installed and in your PATH.")
        sys.exit(1)

def check_and_install_pnpm():
    try:
        subprocess.run(['pnpm', '--version'], check=True, capture_output=True)
        print("pnpm is already installed.")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("pnpm not found. Installing pnpm globally...")
        try:
            # Using npm to install pnpm globally
            run_command(['npm', 'install', '-g', 'pnpm'])
            print("\npnpm installed globally. You might need to restart your terminal for global access.")
        except Exception as e:
            print(f"Failed to install pnpm: {e}")
            print("Please install pnpm manually: `npm install -g pnpm` or `corepack enable`")
            sys.exit(1)

def main():
    print("--- FRONT ROW Project Installer ---")
    print("This script will set up your project structure, install dependencies,")
    print("and configure development tools.")

    # 1. Expand files
    print("\n[ ] Phase 0: Project Setup & Initial Scaffolding")
    print("    Expanding project files...")
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir) # Ensure we are in the directory where the script is run

    for filepath, content in FILE_CONTENTS.items():
        create_file(filepath, content, is_executable=filepath.endswith('.sh'))
    print("[x] Phase 0: Project Setup & Initial Scaffolding - Files Expanded.")

    # 2. Install dependencies
    print("\n[ ] Phase 1: Installing Dependencies")
    print("    Checking for pnpm...")
    check_and_install_pnpm()

    print("    Installing frontend dependencies (front-row-app)...")
    run_command(['pnpm', 'install'], cwd='front-row-app')

    print("    Installing backend dependencies (server)...")
    run_command(['pnpm', 'install'], cwd='server')

    print("    Installing Python test dependencies (tests)...")
    # Create requirements.txt first
    REQUIREMENTS_TXT_CONTENT = """
playwright==1.44.0
requests==2.32.3
python-socketio[asyncio_client]==5.11.0
"""
    os.makedirs('tests', exist_ok=True)
    with open('tests/requirements.txt', 'w') as f:
        f.write(REQUIREMENTS_TXT_CONTENT.strip())
    print("  Created tests/requirements.txt")

    run_command([sys.executable, '-m', 'pip', 'install', '-r', os.path.join('tests', 'requirements.txt')])
    run_command(['playwright', 'install'], cwd='tests') # Install Playwright browser binaries
    print("[x] Phase 1: Dependencies Installed.")

    # 3. CLI Authentication (Interactive)
    print("\n[ ] Phase 2: CLI Authentication for Deployment Tools")
    print("    This step will launch Netlify and Supabase CLI authentication processes.")
    print("    Please follow the prompts in your browser/terminal for each.")

    print("\n    [ ] Authenticating Netlify CLI...")
    print("    Launching 'netlify login'. Please complete authentication in your browser.")
    try:
        subprocess.run(['netlify', 'login'], check=True)
        print("    [x] Netlify CLI authenticated successfully.")
    except FileNotFoundError:
        print("    Netlify CLI not found. Please install it: `npm install -g netlify-cli`")
        print("    Skipping Netlify authentication.")
    except subprocess.CalledProcessError:
        print("    Netlify authentication failed or was cancelled. Please try again manually.")

    print("\n    [ ] Authenticating Supabase CLI...")
    print("    Launching 'supabase login'. Please complete authentication in your browser.")
    try:
        subprocess.run(['supabase', 'login'], check=True)
        print("    [x] Supabase CLI authenticated successfully.")
    except FileNotFoundError:
        print("    Supabase CLI not found. Please install it: `npm install -g supabase`")
        print("    Skipping Supabase authentication.")
    except subprocess.CalledProcessError:
        print("    Supabase authentication failed or was cancelled. Please try again manually.")

    print("[x] Phase 2: CLI Authentication Attempted.")

    # 4. Project Initialization for Deployment
    print("\n[ ] Phase 3: Initializing Deployment Configurations")

    print("    [ ] Initializing Netlify project (frontend)...")
    # This command sets up the project with Netlify, linking it to a site
    # This might require interactive prompts, but if already linked via Git, it might skip.
    print("    Please follow any Netlify CLI prompts (e.g., 'Link to an existing site' or 'Create and configure a new site').")
    try:
        run_command(['netlify', 'init', '--force'], cwd='front-row-app') # Use --force to avoid prompts if possible
        print("    [x] Netlify project initialized (frontend).")
    except subprocess.CalledProcessError:
        print("    Netlify project initialization failed. You may need to run `netlify init` manually in `front-row-app` directory.")


    print("    [ ] Initializing Supabase local project (for future backend/DB integration)...")
    # This command creates a local 'supabase' directory with config.toml and migrations
    try:
        run_command(['supabase', 'init'], cwd='.') # Initialize in root directory
        print("    [x] Supabase local project initialized.")
    except subprocess.CalledProcessError:
        print("    Supabase local project initialization failed. You may need to run `supabase init` manually.")

    print("[x] Phase 3: Deployment Configurations Initialized.")

    # 5. Developer-friendly files
    print("\n[ ] Phase 4: Creating Developer Utility Files")
    # `run_backend.sh`, `run_frontend.sh`, `run_all_tests.sh`, `.env.example`, `.gitignore`, `README.md`
    # These are already created by the file expansion step
    print("    Utility scripts (`run_backend.sh`, `run_frontend.sh`, `run_all_tests.sh`) created.")
    print("    `.gitignore` and `.env.example` created for development setup.")
    print("    `README.md` created with project instructions.")
    print("[x] Phase 4: Developer Utility Files Created.")

    print("\n--- FRONT ROW Project Setup Complete! ---")
    print("\nNext Steps:")
    print("1. Start the Backend: `cd server && npm start`")
    print("2. Start the Frontend: `cd front-row-app && npm start`")
    print("3. Run Auto-Tests: `python tests/auto_test.py` (requires frontend & backend to be running)")
    print("4. Read README.md for more details and deployment instructions.")
    print("\nEnjoy building FRONT ROW!")

if __name__ == '__main__':
    main()
