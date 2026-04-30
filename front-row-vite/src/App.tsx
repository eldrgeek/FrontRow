
import React, { useState, useEffect, useRef, Suspense, useCallback } from 'react';
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
import ScreenTuner from './components/ScreenTuner';
import AnimatedText from './components/AnimatedText';
import SceneTestExposer from './components/SceneTestExposer';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import AudienceMonitor from './components/AudienceMonitor';
import { useLiveKit } from './hooks/useLiveKit';
import config from './config';
import './App.css';
import { createPortal } from 'react-dom';

// Phase 2 types
interface VenueConfig {
  seatCount: number;
  arrangement: 'orchestra' | 'semicircle' | 'cabaret' | 'classroom';
  curtainStyle: string;
  showTitle: string;
  scheduledStart: string | null;
  curtainOpen: boolean;
  configLocked: boolean;
}

// TypeScript interfaces
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

type ShowState = 'idle' | 'pre-show' | 'live' | 'post-show';
type ViewState = 'eye-in-the-sky' | 'performer' | 'user';

function App(): JSX.Element {
  // Initialize state from sessionStorage (per-tab isolation)
  const [userName, setUserName] = useState<string>(() => {
    return sessionStorage.getItem('frontrow_user_name') || '';
  });
  const [userImage, setUserImage] = useState<string | null>(() => {
    return sessionStorage.getItem('frontrow_user_image') || null;
  });
  const [userVideoStream, setUserVideoStream] = useState<MediaStream | null>(null);
  const [userCaptureMode, setUserCaptureMode] = useState<'photo' | 'video'>(() => {
    return (sessionStorage.getItem('frontrow_capture_mode') as 'photo' | 'video') || 'photo';
  });
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const [showState, setShowState] = useState<ShowState>('idle');
  const [currentView, setCurrentView] = useState<ViewState>('eye-in-the-sky');
  const [performerStream, setPerformerStream] = useState<MediaStream | null>(null);
  const [audienceStreams, setAudienceStreams] = useState<Map<string, MediaStream>>(new Map());
  const [audienceSeats, setAudienceSeats] = useState<AudienceSeats>({});

  // Debug audienceSeats changes
  useEffect(() => {
    const seatSummary = Object.entries(audienceSeats).map(([seatId, user]) =>
      `${seatId}: ${user.name} (${user.captureMode})`
    );
    console.log(`🎭 audienceSeats state changed: [${seatSummary.join(', ')}]`);
  }, [audienceSeats]);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [showStreamChoice, setShowStreamChoice] = useState<boolean>(false);
  const [mySocketId, setMySocketId] = useState<string>('');

  // ── Phase 2 state ────────────────────────────────────────────────────────
  const [performerOnStage, setPerformerOnStage] = useState(false);
  const [performerStageZ, setPerformerStageZ] = useState(-18);
  const [performerStageX, setPerformerStageX] = useState(0);
  const [performerOpacity, setPerformerOpacity] = useState(1);
  const [curtainOpen, setCurtainOpen] = useState(false);
  const [curtainStyle, setCurtainStyle] = useState('velvet-red');
  const [reactionLevel, setReactionLevel] = useState(0);
  const [spotlightActive, setSpotlightActive] = useState(false);
  // venueConfig is kept for future seat-count / arrangement rendering
  const [venueConfig, setVenueConfig] = useState<VenueConfig>({
    seatCount: 20,
    arrangement: 'semicircle',
    curtainStyle: 'velvet-red',
    showTitle: '',
    scheduledStart: null,
    curtainOpen: false,
    configLocked: false,
  });
  const stageZRef = useRef(-18);
  const stageXRef = useRef(0);
  const posThrottleRef = useRef(0);
  const walkOffAnimRef = useRef<number | null>(null);
  const entranceAnimRef = useRef<number | null>(null);

  // Camera position state - save positions when switching views
  const [savedCameraPositions, setSavedCameraPositions] = useState<{
    'eye-in-the-sky': { position: [number, number, number]; target: [number, number, number] };
    'user': { position: [number, number, number]; target: [number, number, number] };
  }>({
    'eye-in-the-sky': { position: [-0.57, 6.69, 20.30], target: [0, 3, -10] },
    'user': { position: [0, 1.7, 0], target: [0, 3, -10] },
  });

  // Screen tuner state
  const [showScreenTuner, setShowScreenTuner] = useState<boolean>(false);
  const [screenPosition, setScreenPosition] = useState<[number, number, number]>([0, 7.30, -12]);

  // Animated text state for welcome sequence
  const [showWelcomeText, setShowWelcomeText] = useState<boolean>(false);
  const [showPickSeatText, setShowPickSeatText] = useState<boolean>(false);
  const [welcomeSequenceStarted, setWelcomeSequenceStarted] = useState<boolean>(false);

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Countdown state
  const [isCountdownActive, setIsCountdownActive] = useState(false);
  const [countdownTime, setCountdownTime] = useState(0);
  const [countdownInterval, setCountdownInterval] = useState<NodeJS.Timeout | null>(null);
  const [isCameraPreview, setIsCameraPreview] = useState(false);
  const [quickMode, setQuickMode] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const userVideoStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => { userVideoStreamRef.current = userVideoStream; }, [userVideoStream]);

  // Helper function to check if current user is the artist
  const [isArtist, setIsArtist] = useState(() => {
    return sessionStorage.getItem('frontrow_is_artist') === 'true';
  });

  const isArtistRef = useRef(isArtist);
  useEffect(() => { isArtistRef.current = isArtist; }, [isArtist]);

  // Expose state globally for Playwright E2E tests
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__frontrow_state__ = {
        socketConnected,
        socketId: mySocketId,
        showState,
        role: isArtistRef.current ? 'performer' : 'audience',
        selectedSeat,
        venueConfig,
        curtainOpen,
        performerOnStage,
        hasPerformerStream: !!performerStream,
        performerStreamTracks: performerStream ? performerStream.getTracks().length : 0,
        hasUserStream: !!userVideoStream,
        userStreamTracks: userVideoStream ? userVideoStream.getTracks().length : 0,
        audienceSeats: Object.entries(audienceSeats).map(([seatId, user]) => ({
          seatId,
          name: user?.name || null,
          captureMode: user?.captureMode || null,
          socketId: user?.socketId || null,
          hasLiveStream: audienceStreams.has(user?.name || ''),
        })),
        audienceStreamCount: audienceStreams.size,
        timestamp: Date.now(),
      };
    }
  }, [socketConnected, mySocketId, showState, selectedSeat, performerStream, userVideoStream, audienceSeats, audienceStreams, venueConfig, curtainOpen, performerOnStage]);

  const isPerformer = () => {
    return isArtist;
  };

  const resetArtistStatus = () => {
    sessionStorage.removeItem('frontrow_is_artist');
    setIsArtist(false);
    window.location.reload();
  };

  // LiveKit hook
  const liveKit = useLiveKit();

  const handleAudienceStream = useCallback((identity: string, stream: MediaStream | null) => {
    setAudienceStreams(prev => {
      const next = new Map(prev);
      if (stream) next.set(identity, stream);
      else next.delete(identity);
      return next;
    });
  }, []);

  // E2E test auth bypass - auto-login when ?bypass_auth=true in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('bypass_auth') === 'true' || params.get('test') === 'true') {
      const testName = params.get('test_name') || 'TestUser';
      const testRole = params.get('test_role') || 'audience';
      const isTestArtist = testRole === 'performer';

      console.log('🧪 E2E Test: Bypassing auth', { testName, testRole });

      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = isTestArtist ? '#ff6b35' : '#4CAF50';
        ctx.fillRect(0, 0, 100, 100);
        ctx.fillStyle = 'white';
        ctx.font = '40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(testName[0].toUpperCase(), 50, 65);
      }
      const testImage = canvas.toDataURL('image/png');

      setUserName(testName);
      setUserImage(testImage);
      sessionStorage.setItem('frontrow_user_name', testName);
      sessionStorage.setItem('frontrow_user_image', testImage);

      if (isTestArtist) {
        sessionStorage.setItem('frontrow_is_artist', 'true');
        setIsArtist(true);
        setIsLoggedIn(true);
      } else {
        setUserCaptureMode('photo');
        sessionStorage.setItem('frontrow_capture_mode', 'photo');
        setIsLoggedIn(true);
      }
    }
  }, []); // Only run once on mount

  // Fast onboarding via ?mode= URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (!mode) return;

    if (mode === 'performer') {
      const name = params.get('name') || 'Performer';
      sessionStorage.setItem('frontrow_user_name', name);
      sessionStorage.setItem('frontrow_is_artist', 'true');
      setUserName(name);
      setIsArtist(true);
      setIsLoggedIn(true);
      setQuickMode('performer');
      setTimeout(() => startCameraPreview(), 1500);
    }

    if (mode === 'watch') {
      const guestNum = Math.floor(1000 + Math.random() * 9000);
      const name = params.get('name') || `Guest-${guestNum}`;
      sessionStorage.setItem('frontrow_user_name', name);
      sessionStorage.setItem('frontrow_capture_mode', 'photo');
      setUserName(name);
      setUserCaptureMode('photo');
      setIsLoggedIn(true);
      setCurrentView('user');
      setQuickMode('watch');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Socket.IO Setup ---
  useEffect(() => {
    console.log('Connecting to backend:', config.socketUrl);
    socketRef.current = io(config.socketUrl);
    socketRef.current.on('connect', () => {
      console.log('Socket connected. ID:', socketRef.current?.id, 'IsPerformer:', isPerformer());
      setMySocketId(socketRef.current?.id || '');
      setSocketConnected(true);

      if (isArtistRef.current) {
        console.log('🎭 Artist connected - requesting show reset from backend');
        socketRef.current.emit('reset-show');
      }
    });

    socketRef.current.on('show-status-update', async (data) => {
      console.log('Show Status Update:', data);
      setShowState(data.status);
      // Phase 2: sync venueConfig on join/update
      if (data.venueConfig) {
        setVenueConfig(data.venueConfig);
        setCurtainStyle(data.venueConfig.curtainStyle);
        setCurtainOpen(data.venueConfig.curtainOpen ?? false);
      }
      if (typeof data.performerOnStage === 'boolean') setPerformerOnStage(data.performerOnStage);
      if (data.performerPosition) {
        setPerformerStageZ(data.performerPosition.z);
        setPerformerStageX(data.performerPosition.x);
      }
      if (typeof data.spotlightActive === 'boolean') setSpotlightActive(data.spotlightActive);
      if (data.status === 'live') {
        console.log('🔴 SHOW IS NOW LIVE!');

        if (!isArtistRef.current) {
          // Connect audience to LiveKit
          const name = sessionStorage.getItem('frontrow_user_name') || 'audience';
          try {
            await liveKit.connectAsAudience(
              config.livekitUrl,
              config.tokenUrl,
              name,
              (stream) => setPerformerStream(stream),
              userVideoStreamRef.current || undefined
            );
          } catch (err) {
            console.error('Failed to connect to LiveKit as audience:', err);
          }

          setTimeout(() => {
            const applause = new Audio('/audio/applause.mp3');
            applause.play().catch(e => console.log('Could not play applause audio:', e));
          }, 22 * 60 * 1000);
        } else {
          console.log('👨‍🎤 Performer detected - skipping applause audio');
        }
      }
    });

    socketRef.current.on('show-state-change', (data) => {
      console.log('Show State Change:', data);
      setShowState(data.status);
      if (data.status === 'idle') {
        setPerformerStream(null);
        setIsCountdownActive(false);
        setCountdownTime(0);
        setIsCameraPreview(false);
      }
    });

    socketRef.current.on('seat-update', (data) => {
      console.log(`📥 Frontend received seat-update: ${data.seatId} → ${data.user ? `${data.user.name} (${data.user.captureMode})` : 'EMPTY'}`);
      setAudienceSeats(prev => {
        const newSeats = { ...prev };
        if (data.user) {
          console.log(`✅ Adding user to seat ${data.seatId}: ${data.user.name} [${data.user.socketId}]`);
          newSeats[data.seatId] = data.user;
        } else {
          console.log(`🗑️ Removing user from seat ${data.seatId}`);
          delete newSeats[data.seatId];
        }
        console.log(`📊 Updated audienceSeats state: ${Object.keys(newSeats).length} seats occupied`);
        return newSeats;
      });
    });

    socketRef.current.on('all-seats-empty', () => {
      setAudienceSeats({});
    });

    // ── Phase 2 socket events ──────────────────────────────────────────────
    socketRef.current.on('venue:configUpdated', (cfg: VenueConfig) => {
      setVenueConfig(cfg);
      setCurtainStyle(cfg.curtainStyle);
      setCurtainOpen(cfg.curtainOpen);
    });

    socketRef.current.on('venue:curtain', (data: { action: 'open' | 'close' }) => {
      setCurtainOpen(data.action === 'open');
    });

    socketRef.current.on('performer:onStage', (data: { onStage: boolean }) => {
      setPerformerOnStage(data.onStage);
      if (data.onStage) {
        // Trigger entrance animation
        setPerformerStageZ(-18);
        setPerformerStageX(0);
        setPerformerOpacity(1);
        stageZRef.current = -18;
        stageXRef.current = 0;
        if (entranceAnimRef.current) cancelAnimationFrame(entranceAnimRef.current);
        const start = performance.now();
        const FROM = -18, TO = -8, DUR = 3000;
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / DUR);
          const z = FROM + (TO - FROM) * t;
          stageZRef.current = z;
          setPerformerStageZ(z);
          if (t < 1) { entranceAnimRef.current = requestAnimationFrame(step); }
        };
        entranceAnimRef.current = requestAnimationFrame(step);
      }
    });

    socketRef.current.on('performer:position', (data: { x: number; z: number }) => {
      setPerformerStageZ(data.z);
      setPerformerStageX(data.x);
      stageZRef.current = data.z;
      stageXRef.current = data.x;
    });

    socketRef.current.on('performer:spotlight', (data: { active: boolean }) => {
      setSpotlightActive(data.active);
    });

    socketRef.current.on('stage:reactionLevel', (data: { level: number }) => {
      setReactionLevel(data.level);
    });

    // Countdown event listeners
    socketRef.current.on('countdown-started', (data) => {
      console.log('🎬 Frontend: Countdown started event received:', data);
      setIsCountdownActive(true);
      setCountdownTime(data.timeRemaining);
      setShowState('pre-show');

      if (!isArtistRef.current) {
        setPerformerStream(null);
      }
    });

    socketRef.current.on('countdown-update', (data) => {
      console.log('⏰ Frontend: Countdown update event received:', data.timeRemaining);
      setCountdownTime(data.timeRemaining);
    });

    socketRef.current.on('countdown-finished', async (data) => {
      console.log('🎭 Frontend: Countdown finished event received:', data);
      setIsCountdownActive(false);
      setCountdownTime(0);
      setShowState('live');

      if (isArtistRef.current) {
        console.log('🎥 Countdown finished - starting live stream...');
        if (localStreamRef.current) {
          console.log('🎥 Camera already active - going live with existing stream...');
          setPerformerStream(localStreamRef.current);
          socketRef.current?.emit('artist-go-live');
        } else {
          console.log('🎥 Camera not active - starting camera first...');
          try {
            await startCameraPreview();
            socketRef.current?.emit('artist-go-live');
          } catch (err) {
            console.error('❌ Failed to start camera automatically:', err);
            alert('Failed to start camera automatically. Please turn on camera manually.');
          }
        }
      } else {
        console.log('🎥 Countdown finished - waiting for artist to start stream...');
      }
    });

    socketRef.current.on('countdown-stopped', (_data) => {
      console.log('Countdown stopped');
      setIsCountdownActive(false);
      setCountdownTime(0);
      setIsCameraPreview(false);
      setShowState('idle');

      liveKit.disconnect().then(() => {
        localStreamRef.current = null;
        setPerformerStream(null);
      });
    });

    socketRef.current.on('disconnect', () => {
      setSocketConnected(false);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      liveKit.disconnect();

      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
    };
  }, []); // Only run once on mount - socket connection should persist

  // Keyboard event listener for screen tuner + Phase 2 performer position
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 't') {
        setShowScreenTuner(prev => !prev);
      }
      // Phase 2: arrow keys to adjust performer Z position
      if (!isArtistRef.current || !performerOnStage) return;
      const STEP = 0.5;
      let moved = false;
      if (event.key === 'ArrowUp') {
        stageZRef.current = Math.max(-18, stageZRef.current - STEP);
        moved = true;
      } else if (event.key === 'ArrowDown') {
        stageZRef.current = Math.min(-4, stageZRef.current + STEP);
        moved = true;
      } else if (event.key === 'ArrowLeft') {
        stageXRef.current = Math.max(-8, stageXRef.current - STEP);
        moved = true;
      } else if (event.key === 'ArrowRight') {
        stageXRef.current = Math.min(8, stageXRef.current + STEP);
        moved = true;
      }
      if (moved) {
        setPerformerStageZ(stageZRef.current);
        setPerformerStageX(stageXRef.current);
        const now = Date.now();
        if (now - posThrottleRef.current >= 100) {
          posThrottleRef.current = now;
          socketRef.current?.emit('performer:position', { x: stageXRef.current, z: stageZRef.current });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showScreenTuner, performerOnStage]);

  // Trigger welcome sequence for audience members
  useEffect(() => {
    if (isLoggedIn && !selectedSeat && !isPerformer() && !welcomeSequenceStarted) {
      setWelcomeSequenceStarted(true);
      setShowPickSeatText(false);
      setShowWelcomeText(true);
    } else if (selectedSeat || isPerformer() || !isLoggedIn) {
      setWelcomeSequenceStarted(false);
      setShowWelcomeText(false);
      setShowPickSeatText(false);
    }
  }, [isLoggedIn, selectedSeat, isPerformer, welcomeSequenceStarted]);

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

  const handleStreamChoice = async (startStream: boolean) => {
    if (startStream) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        setUserVideoStream(stream);
        setUserCaptureMode('video');
        sessionStorage.setItem('frontrow_capture_mode', 'video');
        console.log('📹 Video stream started for user');
      } catch (error) {
        console.error('Failed to start video stream:', error);
        setUserCaptureMode('photo');
        sessionStorage.setItem('frontrow_capture_mode', 'photo');
      }
    } else {
      setUserVideoStream(null);
      setUserCaptureMode('photo');
      sessionStorage.setItem('frontrow_capture_mode', 'photo');
      console.log('📷 Using photo mode for user');
    }

    setShowStreamChoice(false);
    setIsLoggedIn(true);
  };

  const handleNameAndImageSubmit = async (name: string, imageBase64: string, isArtist: boolean, videoStream?: MediaStream, explicitCaptureMode?: 'photo' | 'video') => {
    setUserName(name);
    setUserImage(imageBase64);

    const finalCaptureMode = explicitCaptureMode || (videoStream ? 'video' : 'photo');

    if (finalCaptureMode === 'video' && videoStream) {
      setUserVideoStream(videoStream);
      setUserCaptureMode('video');
      sessionStorage.setItem('frontrow_capture_mode', 'video');
    } else {
      setUserVideoStream(null);
      setUserCaptureMode('photo');
      sessionStorage.setItem('frontrow_capture_mode', 'photo');
    }

    console.log('🎯 handleNameAndImageSubmit setting capture mode:', finalCaptureMode);

    sessionStorage.setItem('frontrow_user_name', name);
    if (imageBase64) {
      sessionStorage.setItem('frontrow_user_image', imageBase64);
    }

    sessionStorage.setItem('frontrow_is_artist', isArtist.toString());
    setIsArtist(isArtist);

    console.log('User profile saved to sessionStorage:', { name, hasImage: !!imageBase64, isArtist });

    if (isArtist) {
      setIsLoggedIn(true);
    } else {
      setShowStreamChoice(true);
    }
  };

  const handleSeatSelect = async (seatId) => {
    if (!socketRef.current) return;

    if (selectedSeat && selectedSeat !== seatId) {
      socketRef.current.emit('release-seat', { seatId: selectedSeat });
      console.log('Released old seat:', selectedSeat);
    }

    console.log('Audience: Selecting seat and requesting to join audience...');

    const userData = {
      seatId,
      userName,
      userImage,
      captureMode: userCaptureMode,
      hasVideoStream: !!userVideoStream,
    };

    console.log(`📤 Frontend sending select-seat: ${userData.seatId} for ${userData.userName} (${userData.captureMode})`);
    socketRef.current.emit('select-seat', userData);

    const handleSeatSelectedResponse = (response) => {
      if (response.success) {
        setAudienceSeats(prev => {
          const updated = { ...prev };
          if (selectedSeat) delete updated[selectedSeat];
          return updated;
        });
        setSelectedSeat(seatId);
        setCurrentView('user');

        // Connect to LiveKit if show is already live
        const currentShowState = sessionStorage.getItem('frontrow_show_state') || showState;
        if (currentShowState === 'live') {
          const name = sessionStorage.getItem('frontrow_user_name') || userName || 'audience';
          liveKit.connectAsAudience(
            config.livekitUrl,
            config.tokenUrl,
            name,
            (stream) => setPerformerStream(stream),
            userVideoStreamRef.current || undefined
          ).catch(err => console.error('LiveKit connect failed on seat select:', err));
        }

        console.log('Seat selected:', seatId);
      } else {
        alert(response.message);
      }
      socketRef.current.off('seat-selected', handleSeatSelectedResponse);
    };
    socketRef.current.on('seat-selected', handleSeatSelectedResponse);
  };

  const handleViewChange = (view) => {
    setCurrentView(view);
  };

  const handleCameraPositionChange = (view: 'eye-in-the-sky' | 'user', position: [number, number, number], target: [number, number, number]) => {
    setSavedCameraPositions(prev => ({
      ...prev,
      [view]: { position, target },
    }));
  };

  // Keep showState in sessionStorage so seat-select handler can read it
  useEffect(() => {
    sessionStorage.setItem('frontrow_show_state', showState);
  }, [showState]);

  // --- Show Control Functions ---
  const handleResetShow = async () => {
    try {
      const response = await fetch(`${config.backendUrl}/api/debug-reset-show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // ── Phase 2 actions ────────────────────────────────────────────────────
  const handleWalkOffstage = () => {
    if (!isArtist) return;
    const start = performance.now();
    const DUR = 1000;
    const startX = stageXRef.current;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DUR);
      stageXRef.current = startX + t * 20; // slide to stage-right
      setPerformerStageX(stageXRef.current);
      setPerformerOpacity(1 - t);
      if (t < 1) {
        walkOffAnimRef.current = requestAnimationFrame(step);
      } else {
        // Animation complete — fire offstage event
        socketRef.current?.emit('performer:goOffstage');
        setPerformerOnStage(false);
        stopPerformerStream();
      }
    };
    if (walkOffAnimRef.current) cancelAnimationFrame(walkOffAnimRef.current);
    walkOffAnimRef.current = requestAnimationFrame(step);
  };

  const handleToggleSpotlight = () => {
    const next = !spotlightActive;
    setSpotlightActive(next);
    socketRef.current?.emit('performer:spotlight', { active: next });
  };

  const handleReaction = (type: 'clap' | 'laugh' | 'wow') => {
    socketRef.current?.emit('audience:reaction', { type, seatId: selectedSeat });
  };

  // Countdown functions
  const startCountdown = async (seconds: number) => {
    if (!socketRef.current) {
      console.error('❌ No socket connection available for countdown');
      return;
    }

    if (!isPerformer()) {
      console.error('❌ Only artists can start countdown');
      return;
    }

    try {
      console.log('⏰ Frontend: Starting countdown via backend...', { seconds, socketId: socketRef.current.id });
      socketRef.current.emit('start-countdown', { seconds });
    } catch (err) {
      console.error('❌ Error starting countdown:', err);
      alert('Could not start countdown. Please try again.');
    }
  };

  const stopCountdown = () => {
    if (socketRef.current) {
      socketRef.current.emit('stop-countdown');
    }

    liveKit.disconnect().then(() => {
      localStreamRef.current = null;
      setPerformerStream(null);
    });
    setIsCameraPreview(false);
    setIsCountdownActive(false);
    setCountdownTime(0);
  };

  // --- LiveKit-backed camera/stream functions ---
  const startCameraPreview = async () => {
    if (localStreamRef.current) {
      console.log('🎥 Camera already active');
      if (showState === 'live') {
        socketRef.current?.emit('artist-go-live');
      }
      return;
    }

    try {
      console.log('🎥 Starting camera preview via LiveKit...');
      const stream = await liveKit.connectAsPerformer(
        config.livekitUrl,
        config.tokenUrl,
        sessionStorage.getItem('frontrow_user_name') || 'performer',
        handleAudienceStream
      );
      if (stream) {
        localStreamRef.current = stream;
        setPerformerStream(stream);
        setIsCameraPreview(true);
      }
      if (showState === 'live') {
        socketRef.current?.emit('artist-go-live');
      }
    } catch (err) {
      console.error('Error starting camera preview:', err);
      alert('Could not start camera/microphone. Please check permissions.');
    }
  };

  const stopCameraPreview = async () => {
    await liveKit.disconnect();
    localStreamRef.current = null;
    setPerformerStream(null);
    setIsCameraPreview(false);
  };

  const startPerformerStream = async () => {
    try {
      console.log('🎭 Starting performer stream via LiveKit...');
      const stream = await liveKit.connectAsPerformer(
        config.livekitUrl,
        config.tokenUrl,
        sessionStorage.getItem('frontrow_user_name') || 'performer',
        handleAudienceStream
      );
      if (stream) {
        localStreamRef.current = stream;
        setPerformerStream(stream);
      }
      socketRef.current?.emit('artist-go-live');
      console.log('🎭 LiveKit: Performer stream started');
    } catch (err) {
      console.error('Error starting performer stream:', err);
      alert('Could not start camera/microphone or connect to LiveKit. Please check permissions.');
    }
  };

  const stopPerformerStream = async () => {
    console.log('🎭 Stopping performer stream...');
    await liveKit.disconnect();
    localStreamRef.current = null;
    setPerformerStream(null);
    setIsCameraPreview(false);
    setIsCountdownActive(false);
    setCountdownTime(0);
    if (socketRef.current) {
      socketRef.current.emit('artist-end-show');
    }
    sessionStorage.removeItem('frontrow_is_artist');
    window.location.reload();
  };

  // --- Local Browser Recording ---
  const startRecording = (recordExperience = false) => {
    if (!performerStream && !recordExperience) {
      alert("No live performance to record!");
      return;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      alert("Already recording!");
      return;
    }

    let streamToRecord;
    if (recordExperience) {
      const canvas = document.querySelector('canvas');
      if (!canvas) {
        alert("Canvas not found for experience recording.");
        return;
      }
      streamToRecord = canvas.captureStream(30);
      if (performerStream && performerStream.getAudioTracks().length > 0) {
        streamToRecord.addTrack(performerStream.getAudioTracks()[0]);
      } else {
        console.warn("No performer audio stream to add to experience recording.");
      }
    } else {
      streamToRecord = performerStream;
    }

    recordedChunksRef.current = [];
    try {
      mediaRecorderRef.current = new MediaRecorder(streamToRecord, { mimeType: 'video/webm; codecs=vp8,opus' });
    } catch (e) {
      console.error('Error creating MediaRecorder with preferred codec, trying fallback:', e);
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
    a.style.cssText = 'display: none';
    a.href = url;
    a.download = `frontrow_recording_${new Date().toISOString()}.webm`;
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    recordedChunksRef.current = [];
  };

  const [webglSupported, setWebglSupported] = React.useState(true);

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
            camera={{ position: [-0.57, 6.69, 20.30], fov: 50 }}
            onCreated={({ gl }) => {
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

            <OrbitControls makeDefault enablePan={true} enableZoom={true} enableRotate={true} />

            <CameraController
              currentView={currentView}
              selectedSeat={selectedSeat}
              savedPositions={savedCameraPositions}
              onPositionChange={handleCameraPositionChange}
            />

            <Stage
              config={config}
              showState={showState}
              fallbackVideoUrl="https://youtu.be/K6ZeroIZd5g"
              performerStream={performerStream}
              countdownTime={countdownTime}
              isCountdownActive={isCountdownActive}
              isPerformer={isPerformer()}
              screenPosition={screenPosition}
              performerOnStage={performerOnStage}
              performerStageZ={performerStageZ}
              performerStageX={performerStageX}
              performerOpacity={performerOpacity}
              curtainOpen={curtainOpen}
              curtainStyle={curtainStyle}
              reactionLevel={reactionLevel}
              spotlightActive={spotlightActive}
            />
            <SeatSelection
              selectedSeat={selectedSeat}
              onSeatSelect={handleSeatSelect}
              audienceSeats={audienceSeats}
              mySocketId={mySocketId}
              myVideoStream={userVideoStream}
              myCaptureMode={userCaptureMode}
              hideMyPhoto={currentView === 'user'}
              audienceStreams={audienceStreams}
            />

            {isPerformer() && (
              <PerformerView localStream={localStreamRef.current} />
            )}
            {!isPerformer() && currentView === 'user' && (
              <UserView selectedSeat={selectedSeat} audienceSeats={audienceSeats} />
            )}
            {showState === 'pre-show' && (
              <Text position={[0, 5, -11]} fontSize={0.8} color="white" anchorX="center" anchorY="middle">SHOW STARTS SOON!</Text>
            )}
            {showState === 'live' && (
              <Text position={[0, 5, -11]} fontSize={0.8} color="#ff3b3b" anchorX="center" anchorY="middle">LIVE</Text>
            )}
            {showState === 'post-show' && (
              <Text position={[0, 5, -11]} fontSize={0.8} color="white" anchorX="center" anchorY="middle">THANK YOU!</Text>
            )}

            {showWelcomeText && (
              <AnimatedText
                text={`Welcome, ${userName}!`}
                position={[0, 8, -8]}
                fontSize={2.0}
                color="#4CAF50"
                duration={3}
                onComplete={() => {
                  setShowWelcomeText(false);
                  setTimeout(() => {
                    setShowPickSeatText(true);
                  }, 100);
                }}
              />
            )}
            {showPickSeatText && (
              <AnimatedText
                text="Pick your seat"
                position={[0, 8, -8]}
                fontSize={1.5}
                color="white"
                duration={3}
                onComplete={() => {
                  setShowPickSeatText(false);
                }}
              />
            )}

            {(import.meta.env.MODE === 'development' || import.meta.env.VITE_ENABLE_TEST_MODE === 'true') && <SceneTestExposer />}
          </Canvas>
        </Suspense>
      ) : showStreamChoice ? (
        <div className="stream-choice-background" style={{
          width: '100vw',
          height: '100vh',
          background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          color: 'white',
          textAlign: 'center',
          padding: '20px',
        }}>
          <h2 style={{ marginBottom: '30px', color: '#ffd700' }}>Welcome to FRONT ROW, {userName}!</h2>
          <h3 style={{ marginBottom: '20px', fontWeight: 'normal' }}>How would you like to appear to others?</h3>
          <div style={{ display: 'flex', gap: '20px', flexDirection: 'column', alignItems: 'center' }}>
            <button
              onClick={() => handleStreamChoice(false)}
              style={{
                background: '#4CAF50',
                color: 'white',
                border: 'none',
                padding: '20px 40px',
                borderRadius: '8px',
                fontSize: '18px',
                cursor: 'pointer',
                minWidth: '300px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
              }}
            >
              📷 Use My Photo
              <small style={{ display: 'block', fontSize: '14px', opacity: '0.8' }}>
                Show my captured photo to other audience members
              </small>
            </button>
            <button
              onClick={() => handleStreamChoice(true)}
              style={{
                background: '#FF5722',
                color: 'white',
                border: 'none',
                padding: '20px 40px',
                borderRadius: '8px',
                fontSize: '18px',
                cursor: 'pointer',
                minWidth: '300px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
              }}
            >
              🎥 Start Video Stream
              <small style={{ display: 'block', fontSize: '14px', opacity: '0.8' }}>
                Stream live video to other audience members
              </small>
            </button>
          </div>
        </div>
      ) : !isLoggedIn ? (
        <div className="login-background" style={{
          width: '100vw',
          height: '100vh',
          background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          color: 'white',
          textAlign: 'center',
        }}>
          <UserInputForm onSubmit={handleNameAndImageSubmit} />
        </div>
      ) : (
        <div className="webgl-fallback" style={{
          width: '100vw',
          height: '100vh',
          background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          color: 'white',
          textAlign: 'center',
        }}>
          <h2>🎭 FRONT ROW</h2>
          <p>WebGL is not supported in this environment.</p>
          <p>The 3D theater experience requires WebGL support.</p>
        </div>
      )}

      {/* HTML Overlay for UI elements */}
      {createPortal(
        <div className="ui-overlay">
          {/* Hidden show state for E2E testing */}
          <span data-testid="show-state" style={{ display: 'none' }}>{showState}</span>

          {!isLoggedIn && !showStreamChoice && !isPerformer() && (
            <UserInputForm onSubmit={handleNameAndImageSubmit} />
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
              onStopCountdown={stopCountdown}
              onStartCameraPreview={startCameraPreview}
              onStopCameraPreview={stopCameraPreview}
              isCountdownActive={isCountdownActive}
              countdownTime={countdownTime}
              isCameraPreview={isCameraPreview}
              showState={showState}
              performerOnStage={performerOnStage}
              performerStageZ={performerStageZ}
              spotlightActive={spotlightActive}
              onWalkOffstage={handleWalkOffstage}
              onToggleSpotlight={handleToggleSpotlight}
              onStageZChange={(z) => {
                stageZRef.current = z;
                setPerformerStageZ(z);
                const now = Date.now();
                if (now - posThrottleRef.current >= 100) {
                  posThrottleRef.current = now;
                  socketRef.current?.emit('performer:position', { x: stageXRef.current, z });
                }
              }}
            />
          )}
          {/* Phase 2: Reaction buttons — audience only in user ViewState */}
          {isLoggedIn && !isPerformer() && currentView === 'user' && selectedSeat && (
            <div
              data-testid="reaction-buttons"
              style={{
                position: 'fixed',
                bottom: 24,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: 12,
                zIndex: 9998,
              }}
            >
              {(['clap', 'laugh', 'wow'] as const).map((type) => (
                <button
                  key={type}
                  data-testid={`reaction-${type}`}
                  onClick={() => handleReaction(type)}
                  style={{
                    fontSize: 28,
                    background: 'rgba(0,0,0,0.55)',
                    border: '1.5px solid rgba(255,255,255,0.25)',
                    borderRadius: 50,
                    width: 56,
                    height: 56,
                    cursor: 'pointer',
                    backdropFilter: 'blur(6px)',
                    transition: 'transform 0.1s',
                  }}
                  onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.9)')}
                  onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {type === 'clap' ? '👏' : type === 'laugh' ? '😂' : '🤩'}
                </button>
              ))}
            </div>
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

          {showScreenTuner && (
            <ScreenTuner
              pos={screenPosition}
              onChange={setScreenPosition}
              onClose={() => setShowScreenTuner(false)}
            />
          )}

          {/* Audience monitor — visible only to performer, shows all live audience video streams */}
          <AudienceMonitor
            audienceStreams={audienceStreams}
            isPerformer={isPerformer()}
          />

          {/* Quick mode: performer GO LIVE button */}
          {quickMode === 'performer' && isLoggedIn && showState !== 'live' && (
            <div style={{
              position: 'fixed',
              top: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9999,
            }}>
              <button
                onClick={() => {
                  startPerformerStream();
                  socketRef.current?.emit('artist-go-live');
                }}
                style={{
                  background: '#cc0000',
                  color: 'white',
                  border: '3px solid #ff4444',
                  padding: '16px 36px',
                  borderRadius: '8px',
                  fontSize: '22px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  animation: 'pulse 1.5s infinite',
                  boxShadow: '0 0 20px rgba(255,0,0,0.6)',
                }}
              >
                GO LIVE NOW
              </button>
            </div>
          )}

          {/* Quick mode: audience watch status */}
          {quickMode === 'watch' && isLoggedIn && (
            <div style={{
              position: 'fixed',
              top: '12px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9999,
              background: 'rgba(0,0,0,0.6)',
              color: 'white',
              padding: '8px 20px',
              borderRadius: '6px',
              fontSize: '16px',
              pointerEvents: 'none',
            }}>
              {showState === 'live' ? 'WATCHING LIVE' : 'Waiting for show...'}
            </div>
          )}
        </div>,
        document.getElementById('overlay-root') as HTMLElement
      )}

      {isLoggedIn && <CameraControls />}

      {new URLSearchParams(window.location.search).get('diag') === 'true' && (
        <DiagnosticsPanel
          socketConnected={socketConnected}
          socketId={mySocketId}
          showState={showState}
          performerStream={performerStream}
          userVideoStream={userVideoStream}
          selectedSeat={selectedSeat}
          isArtist={isArtist}
        />
      )}
    </div>
  );
}

export default App;
