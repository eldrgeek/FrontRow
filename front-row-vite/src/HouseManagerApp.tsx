import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import HouseManagerPanel from './components/HouseManagerPanel';
import config from './config';

export interface VenueConfig {
  seatCount: number;
  arrangement: 'orchestra' | 'semicircle' | 'cabaret' | 'classroom';
  curtainStyle: string;
  showTitle: string;
  scheduledStart: string | null;
  curtainOpen: boolean;
  configLocked: boolean;
}

const DEFAULT_VENUE_CONFIG: VenueConfig = {
  seatCount: 20,
  arrangement: 'semicircle',
  curtainStyle: 'velvet-red',
  showTitle: '',
  scheduledStart: null,
  curtainOpen: false,
  configLocked: false,
};

export default function HouseManagerApp(): JSX.Element {
  const socketRef = useRef<Socket | null>(null);
  const [venueConfig, setVenueConfig] = useState<VenueConfig>(DEFAULT_VENUE_CONFIG);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    socketRef.current = io(config.socketUrl);
    socketRef.current.on('connect', () => setConnected(true));
    socketRef.current.on('disconnect', () => setConnected(false));
    socketRef.current.on('show-status-update', (data) => {
      if (data.venueConfig) setVenueConfig(prev => ({ ...prev, ...data.venueConfig }));
    });
    socketRef.current.on('venue:configUpdated', (cfg: VenueConfig) => {
      setVenueConfig(cfg);
    });
    socketRef.current.on('venue:curtain', (data: { action: 'open' | 'close' }) => {
      setVenueConfig(prev => ({ ...prev, curtainOpen: data.action === 'open' }));
    });

    return () => { socketRef.current?.disconnect(); };
  }, []);

  const handleConfigChange = (updates: Partial<VenueConfig>) => {
    if (venueConfig.configLocked && !('configLocked' in updates)) return;
    const next = { ...venueConfig, ...updates };
    setVenueConfig(next);
    socketRef.current?.emit('hm:configUpdate', next);
  };

  const handleCurtain = (action: 'open' | 'close') => {
    socketRef.current?.emit('hm:curtain', { action });
    setVenueConfig(prev => ({ ...prev, curtainOpen: action === 'open' }));
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'linear-gradient(135deg, #1e0a3c 0%, #3a1060 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontFamily: 'sans-serif',
    }}>
      <div style={{
        position: 'absolute',
        top: 12,
        right: 16,
        fontSize: 12,
        opacity: 0.6,
      }}>
        {connected ? '🟢 Connected' : '🔴 Disconnected'}
      </div>
      <h1 style={{ marginBottom: 8, color: '#ffd700', letterSpacing: 2 }}>🎭 FRONT ROW</h1>
      <h2 style={{ marginBottom: 32, fontWeight: 300, opacity: 0.8 }}>House Manager Console</h2>
      <HouseManagerPanel
        venueConfig={venueConfig}
        onConfigChange={handleConfigChange}
        onCurtain={handleCurtain}
      />
    </div>
  );
}
