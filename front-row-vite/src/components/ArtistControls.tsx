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
  onStartCountdown?: (seconds: number) => void;
  onStopCountdown?: () => void;
  onStartCameraPreview?: () => void;
  onStopCameraPreview?: () => void;
  isCountdownActive?: boolean;
  countdownTime?: number;
  isCameraPreview?: boolean;
  showState?: 'idle' | 'pre-show' | 'live' | 'post-show';
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
  onStopCountdown,
  onStartCameraPreview,
  onStopCameraPreview,
  isCountdownActive = false,
  countdownTime = 0,
  isCameraPreview = false,
  showState = 'idle'
}: ArtistControlsProps) {
  const [countdownSeconds, setCountdownSeconds] = useState(120); // Default to 2 minutes (120 seconds)
  const [showCountdownInput, setShowCountdownInput] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartCountdown = () => {
    if (onStartCountdown) {
      // Pass seconds directly to backend
      onStartCountdown(countdownSeconds);
      setShowCountdownInput(false);
    }
  };

  // Keep panel expanded during live shows - no auto-collapse

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
      {(!isExpanded || (performerStream && !isCountdownActive && showState === 'live' && !isExpanded)) && (
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
          {performerStream && !isCountdownActive && showState === 'live' && <span style={{color: '#ff3b3b'}}>🔴 LIVE</span>}
          {isCountdownActive && <span style={{color: '#ff3b3b'}}>⏰ {formatCountdown(countdownTime)}</span>}
        </div>
      )}

      {/* Expanded state - full controls */}
      {isExpanded && (
        <div style={{
          padding: '20px',
          minWidth: '300px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#ffd700' }}>🎭 Artist Controls</h3>
          
          {/* Countdown Display in Controls */}
          {isCountdownActive && (
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
              <button 
                onClick={onStopCountdown}
                style={{
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  marginTop: '8px'
                }}
              >
                ⏹️ Stop Countdown
              </button>
            </div>
          )}
          
          {/* Countdown Section - only show when not active */}
          {!isCountdownActive && (
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
                    Countdown (seconds):
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="3600"
                    value={countdownSeconds}
                    onChange={(e) => setCountdownSeconds(parseInt(e.target.value) || 120)}
                    style={{
                      width: '80px',
                      padding: '5px',
                      marginRight: '10px',
                      borderRadius: '3px',
                      border: '1px solid #ccc'
                    }}
                  />
                  <span style={{ fontSize: '0.8em', color: '#666' }}>
                    ({formatCountdown(countdownSeconds)})
                  </span>
                  <div style={{ marginTop: '5px', marginBottom: '5px' }}>
                    <button 
                      onClick={() => setCountdownSeconds(30)}
                      style={{
                        background: '#17a2b8',
                        color: 'white',
                        border: 'none',
                        padding: '3px 8px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        marginRight: '5px',
                        fontSize: '0.8em'
                      }}
                    >
                      30s
                    </button>
                    <button 
                      onClick={() => setCountdownSeconds(60)}
                      style={{
                        background: '#17a2b8',
                        color: 'white',
                        border: 'none',
                        padding: '3px 8px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        marginRight: '5px',
                        fontSize: '0.8em'
                      }}
                    >
                      1m
                    </button>
                    <button 
                      onClick={() => setCountdownSeconds(120)}
                      style={{
                        background: '#17a2b8',
                        color: 'white',
                        border: 'none',
                        padding: '3px 8px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        marginRight: '5px',
                        fontSize: '0.8em'
                      }}
                    >
                      2m
                    </button>
                  </div>
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
              isCountdownActive ? (
                // During countdown, show Camera On/Off buttons
                <div>
                  {!isCameraPreview ? (
                    <button 
                      onClick={onStartCameraPreview}
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
                      📹 Camera On
                    </button>
                  ) : (
                    <button 
                      onClick={onStopCameraPreview}
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
                      📹 Camera Off
                    </button>
                  )}
                  <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(255, 0, 0, 0.1)', borderRadius: '5px' }}>
                    <div style={{ fontSize: '0.9em', color: '#ff3b3b', marginBottom: '5px' }}>
                      ⏰ Countdown Active
                    </div>
                    <div style={{ fontSize: '0.8em', color: '#666' }}>
                      Turn on camera to start streaming when countdown ends
                    </div>
                  </div>
                </div>
              ) : (
                // Normal Go Live button when not in countdown
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
              )
            ) : showState === 'live' ? (
              // Live stream is active
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
            ) : (
              // Camera preview during countdown
              <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(0, 255, 0, 0.1)', borderRadius: '5px' }}>
                <div style={{ fontSize: '1.2em', color: '#28a745', marginBottom: '5px' }}>
                  📹 Camera On
                </div>
                <div style={{ fontSize: '0.8em', color: '#666' }}>
                  Preview active - stream will start when countdown ends
                </div>
                <button 
                  onClick={onStopCameraPreview}
                  style={{
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    padding: '5px 10px',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    marginTop: '8px'
                  }}
                >
                  📹 Turn Off Camera
                </button>
              </div>
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
      )}
    </div>
  );
} 