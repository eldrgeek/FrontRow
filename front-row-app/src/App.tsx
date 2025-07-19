
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Html } from '@react-three/drei';
import { io, Socket } from 'socket.io-client';
import Stage from './components/Stage';
import SeatSelection from './components/SeatSelection';
import UserInputForm from './components/UserInputForm';
import PerformerView from './components/PerformerView';
import UserView from './components/UserView';
import LoadingScreen from './components/LoadingScreen';
import config from './config';
import './App.css';

// TypeScript interfaces
interface AudienceSeat {
  name: string;
  imageUrl: string;
  socketId: string;
}

interface AudienceSeats {
  [seatId: string]: AudienceSeat;
}

type ShowState = 'pre-show' | 'live' | 'post-show';
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
  const [userName, setUserName] = useState<string>('');
  const [userImage, setUserImage] = useState<string | null>(null); // Base64 or URL
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const [showState, setShowState] = useState<ShowState>('pre-show');
  const [currentView, setCurrentView] = useState<ViewState>('eye-in-the-sky');
  const [performerStream, setPerformerStream] = useState<MediaStream | null>(null);
  const [audienceSeats, setAudienceSeats] = useState<AudienceSeats>({});
  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<{ [socketId: string]: RTCPeerConnection }>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

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
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
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
