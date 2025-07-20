import React, { useState } from 'react';
import { BUILD_INFO } from '../buildInfo';

interface ArtistControlsProps {
  performerStream: MediaStream | null;
  onStartStream: () => void;
  onStopStream: () => void;
  onResetArtistStatus: () => void;
  userName: string;
  onResetShow?: () => void;
  onEndShow?: () => void;
}

function ArtistControls({ 
  performerStream, 
  onStartStream, 
  onStopStream, 
  onResetArtistStatus,
  userName,
  onResetShow,
  onEndShow
}: ArtistControlsProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleResetShow = () => {
    if (onResetShow) {
      onResetShow();
    }
  };

  const handleEndShow = () => {
    if (onEndShow) {
      onEndShow();
    }
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
          
          {/* Show Control Buttons */}
          <button 
            style={{
              ...buttonStyle, 
              fontSize: '0.8em', 
              padding: '6px 10px',
              background: 'rgba(255, 87, 34, 0.2)',
              borderColor: '#FF5722'
            }}
            onClick={handleEndShow}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 87, 34, 0.3)';
              e.currentTarget.style.borderColor = '#FF7043';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 87, 34, 0.2)';
              e.currentTarget.style.borderColor = '#FF5722';
            }}
          >
            🛑 End Show
          </button>
          
          <button 
            style={{
              ...buttonStyle, 
              fontSize: '0.8em', 
              padding: '6px 10px',
              background: 'rgba(156, 39, 176, 0.2)',
              borderColor: '#9C27B0'
            }}
            onClick={handleResetShow}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(156, 39, 176, 0.3)';
              e.currentTarget.style.borderColor = '#BA68C8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(156, 39, 176, 0.2)';
              e.currentTarget.style.borderColor = '#9C27B0';
            }}
          >
            🔄 Reset Show
          </button>
          
          {/* Audience Screen Status Indicator */}
          <div style={{
            padding: '8px 10px',
            fontSize: '0.7em',
            color: 'rgba(255, 255, 255, 0.8)',
            textAlign: 'center',
            borderTop: '1px solid rgba(255, 255, 255, 0.2)',
            marginTop: '8px'
          }}>
            📺 Audience sees: {
              performerStream ? '🔴 Live Stream' : '📺 YouTube Video'
            }
          </div>
          
          {/* Version Information */}
          <div style={{
            padding: '6px 10px',
            fontSize: '0.6em',
            color: 'rgba(255, 255, 255, 0.6)',
            textAlign: 'center',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            marginTop: '4px'
          }}>
            v{BUILD_INFO.version} • {BUILD_INFO.commit} • {new Date(BUILD_INFO.buildTime).toLocaleDateString()}
          </div>
        </div>
      )}
    </div>
  );
}

export default ArtistControls; 