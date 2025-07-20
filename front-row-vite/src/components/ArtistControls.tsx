import React, { useState, useEffect } from 'react';
import { BUILD_INFO } from '../buildInfo';

interface ArtistControlsProps {
  performerStream: MediaStream | null;
  onStartStream: () => void;
  onStopStream: () => void;
  onResetArtistStatus: () => void;
  userName: string;
  onResetShow: () => void;
  onEndShow: () => void;
  onStartCountdown?: (minutes: number) => void;
  isCountdownActive?: boolean;
  countdownTime?: number;
}

export default function ArtistControls({ 
  performerStream, 
  onStartStream, 
  onStopStream, 
  onResetArtistStatus, 
  userName,
  onResetShow,
  onEndShow,
  onStartCountdown,
  isCountdownActive = false,
  countdownTime = 0
}: ArtistControlsProps) {
  const [countdownMinutes, setCountdownMinutes] = useState(5);
  const [showCountdownInput, setShowCountdownInput] = useState(false);

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartCountdown = () => {
    if (onStartCountdown) {
      onStartCountdown(countdownMinutes);
      setShowCountdownInput(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      background: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '20px',
      borderRadius: '10px',
      border: '2px solid rgba(255, 255, 255, 0.2)',
      minWidth: '300px',
      zIndex: 1000
    }}>
      <h3 style={{ margin: '0 0 15px 0', color: '#ffd700' }}>🎭 Artist Controls</h3>
      
      {/* Countdown Section */}
      {isCountdownActive ? (
        <div style={{
          textAlign: 'center',
          padding: '15px',
          background: 'rgba(255, 0, 0, 0.2)',
          borderRadius: '8px',
          marginBottom: '15px'
        }}>
          <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#ff3b3b' }}>
            {formatCountdown(countdownTime)}
          </div>
          <div style={{ fontSize: '0.9em', color: '#ffcccc' }}>
            Show starting...
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: '15px' }}>
          {!showCountdownInput ? (
            <button 
              onClick={() => setShowCountdownInput(true)}
              style={{
                background: '#28a745',
                color: 'white',
                border: 'none',
                padding: '10px 15px',
                borderRadius: '5px',
                cursor: 'pointer',
                width: '100%',
                marginBottom: '10px'
              }}
            >
              ⏰ Start Countdown
            </button>
          ) : (
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                Countdown (minutes):
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={countdownMinutes}
                onChange={(e) => setCountdownMinutes(parseInt(e.target.value) || 5)}
                style={{
                  width: '60px',
                  padding: '5px',
                  marginRight: '10px',
                  borderRadius: '3px',
                  border: '1px solid #ccc'
                }}
              />
              <button 
                onClick={handleStartCountdown}
                style={{
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  marginRight: '5px'
                }}
              >
                Start
              </button>
              <button 
                onClick={() => setShowCountdownInput(false)}
                style={{
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stream Controls */}
      <div style={{ marginBottom: '15px' }}>
        {!performerStream ? (
          <button 
            onClick={onStartStream}
            style={{
              background: '#dc3545',
              color: 'white',
              border: 'none',
              padding: '10px 15px',
              borderRadius: '5px',
              cursor: 'pointer',
              width: '100%',
              marginBottom: '10px'
            }}
          >
            🔴 Go Live
          </button>
        ) : (
          <button 
            onClick={onStopStream}
            style={{
              background: '#6c757d',
              color: 'white',
              border: 'none',
              padding: '10px 15px',
              borderRadius: '5px',
              cursor: 'pointer',
              width: '100%',
              marginBottom: '10px'
            }}
          >
            ⏹️ Stop Stream
          </button>
        )}
      </div>

      {/* Show Control Buttons */}
      <div style={{ marginBottom: '15px' }}>
        <button 
          onClick={onEndShow}
          style={{
            background: '#ffc107',
            color: '#000',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '5px',
            cursor: 'pointer',
            width: '100%',
            marginBottom: '8px'
          }}
        >
          ⏹️ End Show
        </button>
        <button 
          onClick={onResetShow}
          style={{
            background: '#dc3545',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '5px',
            cursor: 'pointer',
            width: '100%'
          }}
        >
          🔄 Reset Show
        </button>
      </div>

      {/* Artist Status */}
      <div style={{
        padding: '10px',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '5px',
        marginBottom: '10px',
        fontSize: '0.9em'
      }}>
        <strong>Artist:</strong> {userName}
      </div>

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
  );
} 