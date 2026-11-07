import React, { useEffect, useRef } from 'react';

interface PerformerMonitorProps {
  localStream?: MediaStream | null;
  /** The phone on the boards, when there is one (src/theater/StageCamera.tsx). */
  stageStream?: MediaStream | null;
}

function Feed({ stream, label, mirror }: { stream: MediaStream; label: string; mirror: boolean }): JSX.Element {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div style={{ position: 'relative', width: 180, height: 110, borderRadius: 8, overflow: 'hidden', background: '#000', border: '2px solid #ffd700', boxShadow: '0 0 16px rgba(0,0,0,0.7)' }}>
      <video ref={ref} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: mirror ? 'scaleX(-1)' : undefined }} />
      <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{label}</div>
    </div>
  );
}

/**
 * The performer's monitors: their own camera(s), in a corner of the page.
 * The performer looks out from the stage at the house (CameraController
 * 'performer'), so the monitor is a flat overlay, not a screen in the scene.
 */
export function PerformerMonitor({ localStream, stageStream }: PerformerMonitorProps): JSX.Element | null {
  if (!localStream && !stageStream) return null;
  return (
    <div data-testid="performer-monitor" style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 9990, display: 'flex', gap: 10, pointerEvents: 'none' }}>
      {localStream && <Feed stream={localStream} label="YOU · big screen" mirror />}
      {stageStream && <Feed stream={stageStream} label="Stage camera" mirror={false} />}
    </div>
  );
}

export default PerformerMonitor;
