import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import Tooltip from './components/Tooltip';
import config from './config';

export default function BackstageRoom(): JSX.Element {
  const socketRef = useRef<Socket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number | null>(null);


  const [connected, setConnected] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [gainValue, setGainValue] = useState(1.0);
  const [performerName, setPerformerName] = useState(
    () => sessionStorage.getItem('frontrow_user_name') || ''
  );
  const [bio, setBio] = useState('');
  const [goingLive, setGoingLive] = useState(false);
  const [isLive, setIsLive] = useState(false);

  // Start camera + mic
  const startCamera = useCallback(async () => {
    try {
      const raw = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      // Build AudioContext gain chain
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(raw);
      const gainNode = ctx.createGain();
      gainNode.gain.value = gainValue;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(gainNode);
      gainNode.connect(analyser);
      // We don't connect analyser to destination — it's just for metering

      gainNodeRef.current = gainNode;
      analyserRef.current = analyser;
      streamRef.current = raw;

      if (videoRef.current) {
        videoRef.current.srcObject = raw;
      }
      setCameraActive(true);

      // Audio level poll loop
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const poll = () => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        rafRef.current = requestAnimationFrame(poll);
      };
      rafRef.current = requestAnimationFrame(poll);
    } catch (err) {
      console.error('BackstageRoom: camera error', err);
      alert('Could not access camera/microphone.');
    }
  }, [gainValue]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setAudioLevel(0);
  }, []);

  // Update gain live
  useEffect(() => {
    if (gainNodeRef.current) gainNodeRef.current.gain.value = gainValue;
  }, [gainValue]);

  // Socket setup
  useEffect(() => {
    socketRef.current = io(config.socketUrl);
    socketRef.current.on('connect', () => {
      setConnected(true);
      socketRef.current?.emit('backstage:join', { role: 'performer' });
    });
    socketRef.current.on('disconnect', () => setConnected(false));
    socketRef.current.on('show-status-update', (data) => {
      if (data.status === 'live') setIsLive(true);
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      socketRef.current?.emit('backstage:leave');
      socketRef.current?.disconnect();
    };
  }, []); // intentionally empty — socket setup is one-time

  const handleGoLive = () => {
    if (!performerName.trim()) { alert('Please enter your name first.'); return; }
    setGoingLive(true);
    sessionStorage.setItem('frontrow_user_name', performerName);
    sessionStorage.setItem('frontrow_is_artist', 'true');
    socketRef.current?.emit('performer:goLive');
    setTimeout(() => {
      // Navigate to main app as performer
      window.location.href = `/?mode=performer&name=${encodeURIComponent(performerName)}`;
    }, 800);
  };

  const levelBars = Array.from({ length: 20 }, (_, i) => i);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'linear-gradient(135deg, #0a0a1e 0%, #1a0a2e 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontFamily: 'sans-serif',
      gap: 24,
    }}>
      {/* Connection badge */}
      <div style={{ position: 'absolute', top: 12, right: 16, fontSize: 12, opacity: 0.6 }}>
        {connected ? '🟢 Connected' : '🔴 Disconnected'}
      </div>

      <h1 style={{ margin: 0, color: '#ffd700', letterSpacing: 2 }}>🎭 Backstage</h1>
      <p style={{ margin: 0, opacity: 0.6, fontSize: 14 }}>Green room — only you and the house manager can see this</p>

      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center' }}>

        {/* Self-preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            width: 320,
            height: 240,
            background: '#111',
            borderRadius: 12,
            overflow: 'hidden',
            border: '2px solid rgba(255,255,255,0.15)',
            position: 'relative',
          }}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />
            {!cameraActive && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 48,
              }}>
                📷
              </div>
            )}
          </div>

          {/* Camera toggle */}
          <button
            data-testid="backstage-camera-btn"
            onClick={cameraActive ? stopCamera : startCamera}
            style={{
              padding: '10px 20px', borderRadius: 7, border: 'none',
              background: cameraActive ? '#dc3545' : '#28a745',
              color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}
          >
            {cameraActive ? '📷 Turn Off Camera' : '📷 Turn On Camera'}
          </button>

          {/* Audio level meter */}
          {cameraActive && (
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>🎤 Audio Level</div>
              <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 32 }}>
                {levelBars.map(i => {
                  const threshold = (i / 20) * 100;
                  const active = audioLevel > threshold;
                  const color = i < 14 ? '#28a745' : i < 17 ? '#ffc107' : '#dc3545';
                  return (
                    <div
                      key={i}
                      data-testid={active ? 'audio-bar-active' : 'audio-bar'}
                      style={{
                        width: 8,
                        height: `${40 + i * 2}%`,
                        background: active ? color : 'rgba(255,255,255,0.15)',
                        borderRadius: 2,
                        transition: 'background 0.05s',
                      }}
                    />
                  );
                })}
              </div>

              {/* Gain slider */}
              <div style={{ marginTop: 10 }}>
                <label style={{ fontSize: 12, opacity: 0.7 }}>
                  🔊 Gain: {gainValue.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={gainValue}
                  data-testid="gain-slider"
                  style={{ width: '100%' }}
                  onChange={e => setGainValue(Number(e.target.value))}
                />
              </div>
            </div>
          )}
        </div>

        {/* Controls panel */}
        <div style={{
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(10px)',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '24px',
          width: 280,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}>
          <h3 style={{ margin: 0, color: '#ffd700' }}>Performer Info</h3>

          <div>
            <label style={{ fontSize: 12, opacity: 0.7, display: 'block', marginBottom: 4 }}>
              Stage Name
            </label>
            <input
              type="text"
              value={performerName}
              placeholder="Your stage name..."
              data-testid="performer-name-input"
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.08)', color: 'white', fontSize: 14,
                boxSizing: 'border-box',
              }}
              onChange={e => setPerformerName(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, opacity: 0.7, display: 'block', marginBottom: 4 }}>
              Bio (optional)
            </label>
            <textarea
              value={bio}
              placeholder="A short bio shown on entrance..."
              data-testid="performer-bio-input"
              rows={3}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.08)', color: 'white', fontSize: 14,
                boxSizing: 'border-box', resize: 'vertical',
              }}
              onChange={e => setBio(e.target.value)}
            />
          </div>

          {/* Go Live */}
          <Tooltip text="Transition from backstage to the main stage — audience will see your entrance" position="left">
            <button
              data-testid="go-live-btn"
              disabled={goingLive || !performerName.trim()}
              onClick={handleGoLive}
              style={{
                padding: '14px 20px',
                borderRadius: 8,
                border: '2px solid #ff3b3b',
                background: goingLive ? '#555' : 'linear-gradient(135deg, #cc0000, #ff3b3b)',
                color: 'white',
                fontWeight: 900,
                fontSize: 18,
                cursor: goingLive || !performerName.trim() ? 'not-allowed' : 'pointer',
                opacity: goingLive ? 0.7 : 1,
                boxShadow: goingLive ? 'none' : '0 0 20px rgba(255,59,59,0.5)',
                transition: 'all 0.2s',
              }}
            >
              {goingLive ? '⏳ Going Live...' : '🔴 Go Live'}
            </button>
          </Tooltip>

          {isLive && (
            <div style={{
              padding: '8px 12px', borderRadius: 6,
              background: 'rgba(220,53,69,0.2)',
              border: '1px solid rgba(220,53,69,0.4)',
              fontSize: 12, color: '#ff8888', textAlign: 'center',
            }}>
              🔴 Show is currently live
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
