import React, { useRef, useEffect, useState } from 'react';

interface AudienceMonitorProps {
  audienceStreams: Map<string, MediaStream>;
  isPerformer: boolean;
}

function VideoTile({ identity, stream }: { identity: string; stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div style={{
      position: 'relative',
      background: '#111',
      borderRadius: '8px',
      overflow: 'hidden',
      aspectRatio: '16/9',
      border: '2px solid rgba(255,255,255,0.15)',
      minWidth: '140px',
      flex: '1 1 140px',
    }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      <div style={{
        position: 'absolute',
        bottom: '4px',
        left: '6px',
        background: 'rgba(0,0,0,0.65)',
        color: '#fff',
        fontSize: '11px',
        padding: '1px 6px',
        borderRadius: '4px',
        fontWeight: 600,
        letterSpacing: '0.02em',
        maxWidth: '90%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {identity}
      </div>
    </div>
  );
}

function AudienceMonitor({ audienceStreams, isPerformer }: AudienceMonitorProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (!isPerformer) return null;

  const entries = Array.from(audienceStreams.entries());

  return (
    <div style={{
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      zIndex: 200,
      width: collapsed ? 'auto' : Math.min(entries.length * 160 + 32, 520) + 'px',
      maxWidth: 'calc(100vw - 32px)',
      background: 'rgba(0,0,0,0.82)',
      borderRadius: '12px',
      border: '1px solid rgba(255,255,255,0.18)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(8px)',
      overflow: 'hidden',
      transition: 'width 0.2s ease',
    }}>
      {/* Header bar */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '13px', letterSpacing: '0.04em' }}>
          👥 AUDIENCE {entries.length > 0 ? `(${entries.length})` : '— waiting...'}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '16px', marginLeft: '8px' }}>
          {collapsed ? '▲' : '▼'}
        </span>
      </div>

      {/* Video grid */}
      {!collapsed && (
        <div style={{
          padding: '10px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          minHeight: entries.length === 0 ? '60px' : undefined,
          alignItems: 'center',
          justifyContent: entries.length === 0 ? 'center' : 'flex-start',
        }}>
          {entries.length === 0 ? (
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', fontStyle: 'italic' }}>
              No live audience cameras yet
            </span>
          ) : (
            entries.map(([identity, stream]) => (
              <VideoTile key={identity} identity={identity} stream={stream} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default AudienceMonitor;
