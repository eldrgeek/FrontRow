import React, { useRef } from 'react';

function CameraControls(): JSX.Element {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const dispatchEvent = (eventType: string) => {
    window.dispatchEvent(new CustomEvent(eventType));
  };

  const startRepeating = (eventType: string) => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    // Dispatch immediately
    dispatchEvent(eventType);
    
    // Start repeating
    intervalRef.current = setInterval(() => {
      dispatchEvent(eventType);
    }, 100); // Repeat every 100ms
  };

  const stopRepeating = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const handleZoomIn = () => dispatchEvent('camera-zoom-in');
  const handleZoomOut = () => dispatchEvent('camera-zoom-out');
  const handleRotateLeft = () => dispatchEvent('camera-rotate-left');
  const handleRotateRight = () => dispatchEvent('camera-rotate-right');
  const handleRotateUp = () => dispatchEvent('camera-rotate-up');
  const handleRotateDown = () => dispatchEvent('camera-rotate-down');
  const handleReset = () => dispatchEvent('camera-reset');

  const buttonStyle = {
    background: 'rgba(255, 255, 255, 0.2)',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    color: 'white',
    padding: '8px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.9em',
    transition: 'all 0.3s ease',
    minWidth: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  };

  const containerStyle = {
    position: 'fixed' as const,
    bottom: '20px',
    left: '20px',
    background: 'rgba(0, 0, 0, 0.9)',
    padding: '15px',
    borderRadius: '15px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    zIndex: 9997,
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    width: '160px'
  };

  return (
    <div style={containerStyle}>
      {/* Top row */}
      <div></div>
      <button
        style={buttonStyle}
        onClick={handleRotateUp}
        onMouseDown={() => startRepeating('camera-rotate-up')}
        onMouseUp={stopRepeating}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
          e.currentTarget.style.borderColor = '#007bff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
          stopRepeating();
        }}
        title="Look Up"
      >
        ⬆️
      </button>
      <button
        style={buttonStyle}
        onClick={handleZoomIn}
        onMouseDown={() => startRepeating('camera-zoom-in')}
        onMouseUp={stopRepeating}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
          e.currentTarget.style.borderColor = '#007bff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
          stopRepeating();
        }}
        title="Zoom In"
      >
        🔍+
      </button>

      {/* Middle row */}
      <button
        style={buttonStyle}
        onClick={handleRotateLeft}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
          e.currentTarget.style.borderColor = '#007bff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        }}
        title="Look Left"
      >
        ⬅️
      </button>
      <button
        style={{ ...buttonStyle, background: 'rgba(0, 123, 255, 0.3)' }}
        onClick={handleReset}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0, 123, 255, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(0, 123, 255, 0.3)';
        }}
        title="Reset View"
      >
        🎯
      </button>
      <button
        style={buttonStyle}
        onClick={handleRotateRight}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
          e.currentTarget.style.borderColor = '#007bff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        }}
        title="Look Right"
      >
        ➡️
      </button>

      {/* Bottom row */}
      <div></div>
      <button
        style={buttonStyle}
        onClick={handleRotateDown}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
          e.currentTarget.style.borderColor = '#007bff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        }}
        title="Look Down"
      >
        ⬇️
      </button>
      <button
        style={buttonStyle}
        onClick={handleZoomOut}
        onMouseDown={() => startRepeating('camera-zoom-out')}
        onMouseUp={stopRepeating}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
          e.currentTarget.style.borderColor = '#007bff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
          stopRepeating();
        }}
        title="Zoom Out"
      >
        🔍-
      </button>
    </div>
  );
}

export default CameraControls; 