import React, { useState } from 'react';

interface ViewControlsProps {
  currentView: 'eye-in-the-sky' | 'user';
  onViewChange: (view: 'eye-in-the-sky' | 'user') => void;
  performerStream: MediaStream | null;
  recordedChunks: Blob[];
  onStartRecording: (includeAudio: boolean) => void;
  onStopRecording: () => void;
  onDownloadRecording: () => void;
}

function ViewControls({ 
  currentView, 
  onViewChange, 
  performerStream, 
  recordedChunks, 
  onStartRecording, 
  onStopRecording, 
  onDownloadRecording 
}: ViewControlsProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);

  const buttonStyle = {
    width: '100%',
    margin: '0',
    padding: '8px 12px',
    fontSize: '0.9em',
    fontWeight: '600' as const,
    borderRadius: '8px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    background: 'rgba(255, 255, 255, 0.2)',
    color: 'white',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    touchAction: 'manipulation' as const,
  };

  const activeButtonStyle = {
    ...buttonStyle,
    background: '#007bff',
    borderColor: '#0056b3',
  };

  const compactButtonStyle = {
    background: 'rgba(0, 123, 255, 0.3)',
    border: '2px solid rgba(0, 123, 255, 0.5)',
    color: 'white',
    padding: '12px',
    borderRadius: '50%',
    cursor: 'pointer',
    fontSize: '1.2em',
    transition: 'all 0.3s ease',
    width: '50px',
    height: '50px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    touchAction: 'manipulation' as const,
  };

  const expandedContainerStyle = {
    position: 'fixed' as const,
    top: '20px',
    right: '20px',
    maxWidth: '180px',
    margin: '0',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
    zIndex: 9999,
    background: 'rgba(0, 0, 0, 0.95)',
    borderRadius: '12px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
    opacity: isExpanded ? 1 : 0,
    transform: isExpanded ? 'scale(1)' : 'scale(0.8)',
    pointerEvents: (isExpanded ? 'auto' : 'none') as 'auto' | 'none',
    transition: 'all 0.3s ease',
  };

  const compactContainerStyle = {
    position: 'fixed' as const,
    top: '20px',
    right: '20px',
    zIndex: 10000,
    opacity: !isExpanded ? 1 : 0,
    transform: !isExpanded ? 'scale(1)' : 'scale(0.8)',
    pointerEvents: (!isExpanded ? 'auto' : 'none') as 'auto' | 'none',
    transition: 'all 0.3s ease',
  };

  const handleExpand = () => {
    setIsExpanded(true);
  };

  const handleCollapse = () => {
    setIsExpanded(false);
  };

  const getViewIcon = () => {
    return currentView === 'eye-in-the-sky' ? '👁️' : '💺';
  };

  return (
    <>
      {/* Compact view - single view icon */}
      <div style={compactContainerStyle}>
        <button
          style={compactButtonStyle}
          onClick={handleExpand}
          onTouchStart={handleExpand}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0, 123, 255, 0.5)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 123, 255, 0.3)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title="View Controls"
        >
          {getViewIcon()}
        </button>
      </div>

      {/* Expanded view - full controls */}
      <div 
        style={expandedContainerStyle} 
        className="controls"
        onMouseLeave={handleCollapse}
        onTouchEnd={handleCollapse}
      >
        <button 
          style={currentView === 'eye-in-the-sky' ? activeButtonStyle : buttonStyle}
          onClick={() => onViewChange('eye-in-the-sky')}
          onMouseEnter={(e) => {
            if (currentView !== 'eye-in-the-sky') {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.borderColor = '#007bff';
            }
          }}
          onMouseLeave={(e) => {
            if (currentView !== 'eye-in-the-sky') {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }
          }}
        >
          👁️ Eye-in-the-Sky
        </button>
        
        <button 
          style={currentView === 'user' ? activeButtonStyle : buttonStyle}
          onClick={() => onViewChange('user')}
          onMouseEnter={(e) => {
            if (currentView !== 'user') {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.borderColor = '#007bff';
            }
          }}
          onMouseLeave={(e) => {
            if (currentView !== 'user') {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }
          }}
        >
          💺 Your Seat View
        </button>

        {performerStream && (
          <>
            <button 
              style={buttonStyle}
              onClick={() => onStartRecording(false)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.borderColor = '#007bff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
              }}
            >
              🎥 Record Performance
            </button>
            <button 
              style={buttonStyle}
              onClick={() => onStartRecording(true)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.borderColor = '#007bff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
              }}
            >
              📱 Record My Experience
            </button>
            <button 
              style={buttonStyle}
              onClick={onStopRecording}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.borderColor = '#007bff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
              }}
            >
              ⏹️ Stop Recording
            </button>
          </>
        )}

        {recordedChunks.length > 0 && (
          <button 
            style={buttonStyle}
            onClick={onDownloadRecording}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.borderColor = '#007bff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }}
          >
            💾 Download Recording
          </button>
        )}
      </div>
    </>
  );
}

export default ViewControls; 