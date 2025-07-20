import React, { useState } from 'react';

interface ArtistControlsProps {
  performerStream: MediaStream | null;
  onStartStream: () => void;
  onStopStream: () => void;
  onResetArtistStatus: () => void;
  userName: string;
}

function ArtistControls({ 
  performerStream, 
  onStartStream, 
  onStopStream, 
  onResetArtistStatus,
  userName
}: ArtistControlsProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(true); // Start expanded for testing

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const iconStyle: React.CSSProperties = {
    fontSize: '1.5em',
    padding: '10px',
    margin: '2px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '8px',
    background: 'rgba(0, 0, 0, 0.7)',
    color: 'white',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    backdropFilter: 'blur(5px)',
    userSelect: 'none',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '8px 12px',
    margin: '4px 0',
    fontSize: '0.9em',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.2)',
    color: 'white',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    width: '100%',
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        left: '20px',
        background: 'rgba(0, 0, 0, 0.8)',
        borderRadius: '8px',
        border: '2px solid rgba(255, 255, 255, 0.3)',
        backdropFilter: 'blur(10px)',
        transition: 'all 0.3s ease',
        overflow: 'hidden',
        zIndex: 3000000502,
        minWidth: '200px',
      }}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      onTouchStart={() => setIsExpanded(true)}
    >
      {/* Collapsed state - artist mode indicator */}
      {!isExpanded && (
        <div style={{ 
          padding: '8px 12px', 
          color: 'white', 
          fontSize: '0.9em',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer'
        }}
        onClick={() => setIsExpanded(true)}
        >
          <span>🎤</span>
          <span>Artist Mode: {userName}</span>
        </div>
      )}

      {/* Expanded state - full controls */}
      {isExpanded && (
        <div style={{
          padding: '15px',
          minWidth: '200px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <div style={{ 
            textAlign: 'center', 
            marginBottom: '8px', 
            fontSize: '0.9em', 
            fontWeight: 'bold',
            color: '#ffd700'
          }}>
            🎤 Artist Controls
          </div>
          
          {!performerStream ? (
            <button 
              style={buttonStyle}
              onClick={onStartStream}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.borderColor = '#4CAF50';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
              }}
            >
              🟢 Go Live
            </button>
          ) : (
            <button 
              style={buttonStyle}
              onClick={onStopStream}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.borderColor = '#f44336';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
              }}
            >
              🔴 End Show
            </button>
          )}
          
          <button 
            style={{...buttonStyle, fontSize: '0.8em', padding: '6px 10px'}}
            onClick={() => alert("Scheduling UI Not Implemented in Rev 1")}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.borderColor = '#2196F3';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }}
          >
            📅 Schedule Show
          </button>
          
          <button 
            style={{...buttonStyle, fontSize: '0.8em', padding: '6px 10px'}}
            onClick={onResetArtistStatus}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.borderColor = '#FF9800';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }}
          >
            👥 Switch to Audience
          </button>
        </div>
      )}
    </div>
  );
}

export default ArtistControls; 