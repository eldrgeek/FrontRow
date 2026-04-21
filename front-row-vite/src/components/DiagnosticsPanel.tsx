import React, { useEffect, useState } from 'react';
import config from '../config';

export function DiagnosticsPanel({
  socketConnected, socketId, showState, performerStream, userVideoStream,
  selectedSeat, isArtist
}: {
  socketConnected: boolean; socketId: string; showState: string;
  performerStream: MediaStream | null; userVideoStream: MediaStream | null;
  selectedSeat: string | null; isArtist: boolean;
}) {
  const [backendDiag, setBackendDiag] = useState<any>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const fetchDiag = async () => {
      try {
        const res = await fetch(`${config.backendUrl}/api/diagnostics`);
        const data = await res.json();
        setBackendDiag(data);
      } catch (e) {
        setErrors(prev => [...prev, `Backend unreachable: ${e}`]);
      }
    };
    fetchDiag();
    const interval = setInterval(fetchDiag, 3000);
    return () => clearInterval(interval);
  }, []);

  const status = (ok: boolean) => ok ? '✅' : '❌';

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'rgba(0,0,0,0.85)', color: '#0f0', fontFamily: 'monospace',
      fontSize: '11px', padding: '8px', zIndex: 9999, maxHeight: '200px',
      overflowY: 'auto', borderTop: '1px solid #0f0'
    }}>
      <div style={{display:'flex', gap:'20px', flexWrap:'wrap'}}>
        <span>{status(socketConnected)} Socket: {socketId || 'disconnected'}</span>
        <span>Show: <b>{showState}</b></span>
        <span>Role: <b>{isArtist ? 'PERFORMER' : 'AUDIENCE'}</b></span>
        <span>{status(!!selectedSeat)} Seat: {selectedSeat || 'none'}</span>
        <span>{status(!!performerStream)} PerformerStream</span>
        <span>{status(!!userVideoStream)} UserStream</span>
        <span>Backend: {config.backendUrl}</span>
        <span>LiveKit: {config.livekitUrl}</span>
      </div>
      {backendDiag && (
        <div style={{marginTop:'4px', color:'#ff0'}}>
          Backend→ Status: {backendDiag.show?.status} |
          Seats: {backendDiag.seats?.length} |
          Connections: {backendDiag.connections?.total} |
          ArtistId: {backendDiag.show?.artistId?.slice(0,8) || 'none'}
        </div>
      )}
      {errors.map((e, i) => <div key={i} style={{color:'red'}}>{e}</div>)}
    </div>
  );
}
