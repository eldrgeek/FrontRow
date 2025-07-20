
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Text } from '@react-three/drei';
import { io, Socket } from 'socket.io-client';
import Stage from './components/Stage';
import SeatSelection from './components/SeatSelection';
import UserInputForm from './components/UserInputForm';
import PerformerView from './components/PerformerView';
import UserView from './components/UserView';
import LoadingScreen from './components/LoadingScreen';
import CameraController from './components/CameraController';
import CameraControls from './components/CameraControls';
import ViewControls from './components/ViewControls';
import ArtistControls from './components/ArtistControls';
import config from './config';
import './App.css';
import { createPortal } from 'react-dom';
import * as THREE from 'three';

// TypeScript interfaces
interface AudienceSeat {
  name: string;
  imageUrl: string;
  socketId: string;
}

interface AudienceSeats {
  [seatId: string]: AudienceSeat;
}

type ShowState = 'idle' | 'pre-show' | 'live' | 'post-show';
type ViewState = 'eye-in-the-sky' | 'performer' | 'user';

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

function App(): JSX.Element {
  // Initialize state from sessionStorage (per-tab isolation)
  const [userName, setUserName] = useState<string>(() => {
    return sessionStorage.getItem('frontrow_user_name') || '';
  });
  const [userImage, setUserImage] = useState<string | null>(() => {
    return sessionStorage.getItem('frontrow_user_image') || null;
  });
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null); // user picks seat each session
  const [showState, setShowState] = useState<ShowState>('idle');
  const [currentView, setCurrentView] = useState<ViewState>('eye-in-the-sky');
  const [performerStream, setPerformerStream] = useState<MediaStream | null>(null);
  const [audienceSeats, setAudienceSeats] = useState<AudienceSeats>({});
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [mySocketId, setMySocketId] = useState<string>('');
  
  // Camera position state - save positions when switching views
  const [savedCameraPositions, setSavedCameraPositions] = useState<{
    'eye-in-the-sky': { position: [number, number, number]; target: [number, number, number] };
    'user': { position: [number, number, number]; target: [number, number, number] };
  }>({
    'eye-in-the-sky': { position: [-0.57, 6.69, 20.30], target: [0, 3, -10] },
    'user': { position: [0, 1.7, 0], target: [0, 3, -10] } // Will be updated when seat is selected - look at performer screen
  });
  
  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<{ [socketId: string]: RTCPeerConnection }>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Countdown state
  const [isCountdownActive, setIsCountdownActive] = useState(false);
  const [countdownTime, setCountdownTime] = useState(0);
  const [countdownInterval, setCountdownInterval] = useState<NodeJS.Timeout | null>(null);

  // Helper function to check if current user is the artist
  const [isArtist, setIsArtist] = useState(() => {
    return sessionStorage.getItem('frontrow_is_artist') === 'true';
  });
  
  const isPerformer = () => {
    return isArtist;
  };

  // Helper function to reset artist status (for debugging/testing)
  const resetArtistStatus = () => {
    sessionStorage.removeItem('frontrow_is_artist');
    setIsArtist(false);
    window.location.reload();
  };

  // --- Socket.IO and WebRTC Setup ---
  useEffect(() => {
    // Connect to backend Socket.IO server
    console.log('Connecting to backend:', config.socketUrl);
    socketRef.current = io(config.socketUrl);
    socketRef.current.on('connect', () => {
      console.log('Socket connected. ID:', socketRef.current?.id, 'IsPerformer:', isPerformer());
      setMySocketId(socketRef.current?.id || '');
    });

    // Socket listeners for show status and seat updates
    socketRef.current.on('show-status-update', (data) => {
      console.log('Show Status Update:', data);
      setShowState(data.status);
      if (data.status === 'live') {
        console.log('🔴 SHOW IS NOW LIVE! Audience should expect WebRTC offers soon...');
        // Start applause sound at end of show (20 minutes for performance + 2 min encore)
        setTimeout(() => {
          const applause = new Audio('/audio/applause.mp3'); // Assuming audio is in public folder
          applause.play().catch(e => console.log('Could not play applause audio:', e));
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
        console.log('Is performer:', isPerformer(), 'Selected seat:', selectedSeat, 'Existing PC:', !!peerConnectionsRef.current[data.offererSocketId]);
        // Only audience members (non-artist) should process offers from artist
        // Removed selectedSeat requirement - allow live stream for any audience member
        if (!isPerformer() && !peerConnectionsRef.current[data.offererSocketId]) {
            console.log('Setting up audience peer connection...');
            await setupAudiencePeerConnection(data.offererSocketId, data.sdp);
        } else {
            console.log('Skipping offer - conditions not met. IsPerformer:', isPerformer(), 'Has existing PC:', !!peerConnectionsRef.current[data.offererSocketId]);
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
        console.log('Received new-audience-member event. audienceSocketId:', audienceSocketId, 'isPerformer:', isPerformer());
        if (isPerformer()) { // Only artist should react to this
            console.log('Artist: New audience member joined:', audienceSocketId);
            console.log('Artist: Creating peer connection for audience member...');
            // Artist initiates a new peer connection for this audience member
            const pc = new RTCPeerConnection({ iceServers: stunServers });
            peerConnectionsRef.current[audienceSocketId] = pc;

            // Enhanced logging for artist side
            pc.onconnectionstatechange = () => {
              console.log('Artist: WebRTC connection state changed to:', pc.connectionState, 'for audience:', audienceSocketId);
            };

            pc.oniceconnectionstatechange = () => {
              console.log('Artist: ICE connection state changed to:', pc.iceConnectionState, 'for audience:', audienceSocketId);
            };

            if (localStreamRef.current) {
                console.log('Artist: Adding local stream tracks to peer connection');
                localStreamRef.current.getTracks().forEach(track => {
                    console.log('Artist: Adding track:', track.kind, track.enabled ? 'enabled' : 'disabled');
                    pc.addTrack(track, localStreamRef.current!);
                });
            } else {
                console.warn('Artist: No local stream available to add to new peer connection.');
            }

            pc.onicecandidate = (event) => {
                if (event.candidate && socketRef.current) {
                    console.log('Artist: Sending ICE candidate to audience:', audienceSocketId);
                    socketRef.current.emit('ice-candidate', {
                        candidate: event.candidate,
                        targetSocketId: audienceSocketId,
                        senderSocketId: socketRef.current.id,
                    });
                } else if (!event.candidate) {
                    console.log('Artist: ICE candidate gathering complete for audience:', audienceSocketId);
                }
            };

            try {
                console.log('Artist: Creating offer for audience:', audienceSocketId);
                const offer = await pc.createOffer();
                
                console.log('Artist: Setting local description (offer)');
                await pc.setLocalDescription(offer);
                
                if (socketRef.current) {
                    console.log('Artist: Sending offer to audience:', audienceSocketId);
                    socketRef.current.emit('offer', {
                        sdp: offer,
                        targetSocketId: audienceSocketId,
                        offererSocketId: socketRef.current.id,
                    });
                    console.log('Artist: Offer sent successfully!');
                }
            } catch (error) {
                console.error('Artist: Error creating/sending offer to audience:', audienceSocketId, error);
            }
        }
    });

    // Listen for artist rejection messages from backend
    socketRef.current.on('artist-rejected', (data) => {
        console.warn('Artist: Go live request rejected by backend:', data.reason);
        alert(`Cannot go live: ${data.reason}\n\nCurrent show status: ${data.currentStatus}\n\nPlease wait for the current show to end or contact support.`);
        
        // Stop any local stream that was started
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
            setPerformerStream(null);
        }
    });


    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      // Close all peer connections on unmount
      Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
      
      // Clean up countdown interval
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
    };
  }, [selectedSeat]); // Re-run effect if seat selected, to initiate audience PC for artist

  // --- User Flow Functions ---
  const clearUserData = () => {
    sessionStorage.removeItem('frontrow_user_name');
    sessionStorage.removeItem('frontrow_user_image');
    sessionStorage.removeItem('frontrow_selected_seat');
    setUserName('');
    setUserImage(null);
    setSelectedSeat(null);
    console.log('User data cleared from sessionStorage');
  };

  const handleNameAndImageSubmit = async (name, imageBase64, isArtist) => {
    setUserName(name);
    setUserImage(imageBase64);
    
    // Save to sessionStorage for per-tab isolation
    sessionStorage.setItem('frontrow_user_name', name);
    if (imageBase64) {
      sessionStorage.setItem('frontrow_user_image', imageBase64);
    }
    
    // Store artist status - we'll use this instead of URL parameters
    sessionStorage.setItem('frontrow_is_artist', isArtist.toString());
    setIsArtist(isArtist); // Update state immediately
    
    console.log('User profile saved to sessionStorage:', { name, hasImage: !!imageBase64, isArtist });
    // User profile data is stored in-memory on backend via select-seat
    setIsLoggedIn(true);
  };

  const handleSeatSelect = async (seatId) => {
    if (!socketRef.current) return;

    // If user already has a seat, release it first (seat switching)
    if (selectedSeat && selectedSeat !== seatId) {
      socketRef.current.emit('release-seat', { seatId: selectedSeat });
      console.log('Released old seat:', selectedSeat);
    }

    // This is where the client requests a seat
    console.log('Audience: Selecting seat and requesting to join audience...');
    socketRef.current.emit('select-seat', { seatId, userName, userImage });

    // Listen for the seat-selected response only once per selection attempt
    const handleSeatSelectedResponse = (response) => {
        if (response.success) {
            // locally clear previous seat entry for this user
            setAudienceSeats(prev=>{
                const updated={...prev};
                if(selectedSeat) delete updated[selectedSeat];
                return updated;
            });
            setSelectedSeat(seatId);
            setCurrentView('user'); // Auto switch to user view after selecting seat
            
            // Do not persist seat between sessions – must pick each time
            
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

  const handleCameraPositionChange = (view: 'eye-in-the-sky' | 'user', position: [number, number, number], target: [number, number, number]) => {
    setSavedCameraPositions(prev => ({
      ...prev,
      [view]: { position, target }
    }));
  };

  // --- Show Control Functions ---
  const handleResetShow = async () => {
    try {
      const response = await fetch(`${config.backendUrl}/api/debug-reset-show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Show reset successfully:', result.message);
        alert('Show status reset to idle');
      } else {
        const error = await response.json();
        console.error('Failed to reset show:', error);
        alert(`Failed to reset show: ${error.error}`);
      }
    } catch (error) {
      console.error('Error resetting show:', error);
      alert('Error connecting to server');
    }
  };

  const handleEndShow = () => {
    if (socketRef.current) {
      socketRef.current.emit('artist-end-show');
      console.log('Artist ending show via controls');
    }
  };

  // Countdown functions
  const startCountdown = (minutes: number) => {
    const totalSeconds = minutes * 60;
    setCountdownTime(totalSeconds);
    setIsCountdownActive(true);
    setShowState('pre-show');
    
    // Stop any existing stream during countdown
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      setPerformerStream(null);
    }
    
    const interval = setInterval(() => {
      setCountdownTime(prev => {
        if (prev <= 1) {
          // Countdown finished, start the stream
          clearInterval(interval);
          setIsCountdownActive(false);
          setCountdownInterval(null);
          startPerformerStream();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    setCountdownInterval(interval);
  };

  const stopCountdown = () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      setCountdownInterval(null);
    }
    setIsCountdownActive(false);
    setCountdownTime(0);
    setShowState('idle');
  };

  // --- WebRTC Functions ---
  const startPerformerStream = async () => {
    if (!socketRef.current) return;
    try {
      console.log('Artist: Starting performer stream...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setPerformerStream(stream); // Set stream for PerformerView to display local camera

      console.log('Artist: Emitting artist-go-live signal...');
      socketRef.current.emit('artist-go-live'); // Signal backend that artist is going live
      console.log('Artist: Go live signal sent');

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
    
    // Clear artist status from sessionStorage when ending show
    sessionStorage.removeItem('frontrow_is_artist');
    
    // Reload page to reset to audience view
    window.location.reload();
  };

  // Audience side setup for receiving artist's stream
  const setupAudiencePeerConnection = async (offererSocketId, offerSdp) => {
    console.log('Audience: Creating new RTCPeerConnection for artist:', offererSocketId);
    const pc = new RTCPeerConnection({ iceServers: stunServers });
    peerConnectionsRef.current[offererSocketId] = pc;

    // Enhanced logging for connection state changes
    pc.onconnectionstatechange = () => {
      console.log('Audience: WebRTC connection state changed to:', pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log('Audience: ICE connection state changed to:', pc.iceConnectionState);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Audience: Sending ICE candidate to artist');
        socketRef.current.emit('ice-candidate', {
          candidate: event.candidate,
          targetSocketId: offererSocketId,
          senderSocketId: socketRef.current.id,
        });
      } else {
        console.log('Audience: ICE candidate gathering complete');
      }
    };

    pc.ontrack = (event) => {
      console.log('Audience: Received remote stream from artist!', event.streams[0]);
      console.log('Audience: Stream has', event.streams[0].getTracks().length, 'tracks');
      if (event.streams && event.streams[0]) {
        setPerformerStream(event.streams[0]); // This stream will be attached to the Stage component's video element
        console.log('Audience: Performer stream set successfully - live video should now appear!');
      } else {
        console.error('Audience: No stream in track event');
      }
    };

    try {
      console.log('Audience: Setting remote description (offer)');
      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
      
      console.log('Audience: Creating answer');
      const answer = await pc.createAnswer();
      
      console.log('Audience: Setting local description (answer)');
      await pc.setLocalDescription(answer);

      console.log('Audience: Sending answer to artist');
      socketRef.current.emit('answer', {
        sdp: answer,
        targetSocketId: offererSocketId,
        answererSocketId: socketRef.current.id,
      });
      
      console.log('Audience: WebRTC setup complete, waiting for connection...');
    } catch (error) {
      console.error('Audience: Error setting up WebRTC connection:', error);
    }
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
      try {
        mediaRecorderRef.current = new MediaRecorder(streamToRecord, { mimeType: 'video/webm' });
      } catch (e2) {
        console.error('Error creating MediaRecorder with fallback codec:', e2);
        alert('Recording not supported in this browser');
        return;
      }
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
    document.body.removeChild(a);
    recordedChunksRef.current = []; // Clear chunks after download
  };



  const [webglSupported, setWebglSupported] = React.useState(true);

  // Check WebGL support
  React.useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setWebglSupported(false);
      }
    } catch (e) {
      setWebglSupported(false);
    }
  }, []);

  return (
    <div className="App">
      {webglSupported && isLoggedIn ? (
        <Suspense fallback={<LoadingScreen />}>
          <Canvas 
            camera={{ position: [-0.57, 6.69, 20.30], fov: 50 }} // Default Eye-in-the-Sky position: updated to user preference
            onCreated={({ gl }) => {
              // Canvas created successfully
              console.log('WebGL context created successfully');
            }}
            onError={(error) => {
              console.error('Canvas error:', error);
              setWebglSupported(false);
            }}
          >
            <Environment preset="city" />
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} />

            {/* Enable OrbitControls for all views to allow pan/zoom */}
            <OrbitControls makeDefault enablePan={true} enableZoom={true} enableRotate={true} />
            
            {/* Camera Controller for smooth view transitions */}
            <CameraController 
              currentView={currentView}
              selectedSeat={selectedSeat}
              savedPositions={savedCameraPositions}
              onPositionChange={handleCameraPositionChange}
            />

            <Stage config={config} showState={showState} fallbackVideoUrl="https://youtu.be/K6ZeroIZd5g" performerStream={performerStream} />
            <SeatSelection
              selectedSeat={selectedSeat}
              onSeatSelect={handleSeatSelect}
              audienceSeats={audienceSeats}
              mySocketId={mySocketId}
            />

            {isPerformer() && (
              <PerformerView localStream={localStreamRef.current} />
            )}
            {!isPerformer() && currentView === 'user' && (
              <UserView selectedSeat={selectedSeat} audienceSeats={audienceSeats} />
            )}
            {/* 3D Status Text */}
            {showState === 'pre-show' && (
              <Text position={[0,5,-11]} fontSize={0.8} color="white" anchorX="center" anchorY="middle">SHOW STARTS SOON!</Text>
            )}
            {showState === 'live' && (
              <Text position={[0,5,-11]} fontSize={0.8} color="#ff3b3b" anchorX="center" anchorY="middle">LIVE</Text>
            )}
            {showState === 'post-show' && (
              <Text position={[0,5,-11]} fontSize={0.8} color="white" anchorX="center" anchorY="middle">THANK YOU!</Text>
            )}
          </Canvas>
        </Suspense>
      ) : !isLoggedIn ? (
        // Show login screen when no user is logged in
        <div className="login-background" style={{ 
          width: '100vw', 
          height: '100vh', 
          background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          color: 'white',
          textAlign: 'center'
        }}>
          {/* Login form will be rendered in ui-overlay */}
          <UserInputForm onSubmit={handleNameAndImageSubmit} />
        </div>
      ) : (
        // WebGL not supported fallback
        <div className="webgl-fallback" style={{ 
          width: '100vw', 
          height: '100vh', 
          background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          color: 'white',
          textAlign: 'center'
        }}>
          <h2>🎭 FRONT ROW</h2>
          <p>WebGL is not supported in this environment.</p>
          <p>The 3D theater experience requires WebGL support.</p>
        </div>
      )}

      {/* HTML Overlay for UI elements - moved outside Canvas */}
      {createPortal(
        <div className="ui-overlay">
          {/* Conditional rendering of UI components */}
          {!isLoggedIn && !isPerformer() && (
            <UserInputForm onSubmit={handleNameAndImageSubmit} />
          )}
          {isLoggedIn && !selectedSeat && !isPerformer() && (
            <div>
              <p>Welcome, {userName}! Pick your seat.</p>
            </div>
          )}
          {isLoggedIn && isPerformer() && (
            <ArtistControls 
              performerStream={performerStream}
              onStartStream={startPerformerStream}
              onStopStream={stopPerformerStream}
              onResetArtistStatus={resetArtistStatus}
              userName={userName}
              onResetShow={handleResetShow}
              onEndShow={handleEndShow}
              onStartCountdown={startCountdown}
              isCountdownActive={isCountdownActive}
              countdownTime={countdownTime}
            />
          )}
          {isLoggedIn && selectedSeat && !isPerformer() && currentView !== 'performer' && (
            <ViewControls 
              currentView={currentView as 'eye-in-the-sky' | 'user'}
              onViewChange={handleViewChange}
              performerStream={performerStream}
              recordedChunks={recordedChunksRef.current}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              onDownloadRecording={downloadRecording}
            />
          )}



          {/* Removed countdawn/live-indicator/thank-you from here */}
        </div>,
        document.getElementById('overlay-root') as HTMLElement
      )}

      {/* Camera Controls - only show when user is logged in */}
      {isLoggedIn && <CameraControls />}
      
    </div>
  );
}

export default App;
