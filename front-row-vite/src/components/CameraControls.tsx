import React, { useRef, useState } from 'react';

function CameraControls(): JSX.Element {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const dispatchEvent = (eventType: string) => {
    window.dispatchEvent(new CustomEvent(eventType));
  };

  const startRepeating = (eventType: string) => {
    // Clear any existing interval and timeout
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // Dispatch immediately
    dispatchEvent(eventType);
    
    // Start repeating after a delay (500ms) to prevent over-sensitivity
    timeoutRef.current = setTimeout(() => {
      if (timeoutRef.current) { // Check if we haven't been cancelled
        intervalRef.current = setInterval(() => {
          dispatchEvent(eventType);
        }, 100); // Repeat every 100ms after initial delay
        timeoutRef.current = null; // Clear timeout reference
      }
    }, 500); // 500ms delay before starting repeat
  };

  const stopRepeating = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const handleZoomIn = () => dispatchEvent('camera-zoom-in');
  const handleZoomOut = () => dispatchEvent('camera-zoom-out');
  const handleOrbitLeft = () => dispatchEvent('camera-orbit-left');
  const handleOrbitRight = () => dispatchEvent('camera-orbit-right');
  const handleMoveUp = () => dispatchEvent('camera-move-up');
  const handleMoveDown = () => dispatchEvent('camera-move-down');
  const handleReset = () => dispatchEvent('camera-reset');
  const handleShowPosition = () => dispatchEvent('camera-show-position');

  const buttonStyle = {
    background: 'rgba(255, 255, 255, 0.2)',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    color: 'white',
    padding: '6px 8px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8em',
    transition: 'all 0.3s ease',
    minWidth: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    touchAction: 'manipulation', // Better mobile touch
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
    touchAction: 'manipulation',
  };

  const expandedContainerStyle = {
    position: 'fixed' as const,
    bottom: '20px',
    left: '20px',
    background: 'rgba(0, 0, 0, 0.95)',
    padding: '12px',
    borderRadius: '12px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
    zIndex: 3000000500,
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gridTemplateRows: 'repeat(3, 1fr)',
    gap: '6px',
    width: '160px',
    height: '120px',
    opacity: isExpanded ? 1 : 0,
    transform: isExpanded ? 'scale(1)' : 'scale(0.8)',
    pointerEvents: (isExpanded ? 'auto' : 'none') as 'auto' | 'none',
    transition: 'all 0.3s ease',
  };

  const compactContainerStyle = {
    position: 'fixed' as const,
    bottom: '20px',
    left: '20px',
    zIndex: 3000000501,
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
    stopRepeating(); // Stop any ongoing repeating when collapsing
  };

  return (
    <>
      {/* Compact view - single camera icon */}
      <div style={compactContainerStyle}>
        <button
          style={compactButtonStyle}
          onClick={handleExpand}
          onTouchStart={handleExpand} // Mobile support
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0, 123, 255, 0.5)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 123, 255, 0.3)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title="Camera Controls"
        >
          📹
        </button>
      </div>

      {/* Expanded view - full controls */}
      <div 
        style={expandedContainerStyle} 
        className="camera-controls"
        onMouseLeave={handleCollapse}
        onTouchEnd={handleCollapse} // Mobile support
      >
        {/* Row 1 */}
        <div></div>
        <button
          style={buttonStyle}
          onClick={handleMoveUp}
          onMouseDown={() => startRepeating('camera-move-up')}
          onTouchStart={() => startRepeating('camera-move-up')}
          onMouseUp={stopRepeating}
          onTouchEnd={stopRepeating}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          }}
          title="Move Up"
        >
          ⬆️
        </button>
        <button
          style={buttonStyle}
          onClick={handleZoomIn}
          onMouseDown={() => startRepeating('camera-zoom-in')}
          onTouchStart={() => startRepeating('camera-zoom-in')}
          onMouseUp={stopRepeating}
          onTouchEnd={stopRepeating}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          }}
          title="Zoom In"
        >
          🔍+
        </button>
        <button
          style={buttonStyle}
          onClick={handleShowPosition}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          }}
          title="Show Position"
        >
          📍
        </button>

        {/* Row 2 */}
        <button
          style={buttonStyle}
          onClick={handleOrbitLeft}
          onMouseDown={() => startRepeating('camera-orbit-left')}
          onTouchStart={() => startRepeating('camera-orbit-left')}
          onMouseUp={stopRepeating}
          onTouchEnd={stopRepeating}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          }}
          title="Orbit Left"
        >
          ⬅️
        </button>
        <button
          style={{ ...buttonStyle, background: 'rgba(0, 123, 255, 0.4)' }}
          onClick={handleReset}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0, 123, 255, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 123, 255, 0.4)';
          }}
          title="Reset View"
        >
          🎯
        </button>
        <button
          style={buttonStyle}
          onClick={handleMoveDown}
          onMouseDown={() => startRepeating('camera-move-down')}
          onTouchStart={() => startRepeating('camera-move-down')}
          onMouseUp={stopRepeating}
          onTouchEnd={stopRepeating}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          }}
          title="Move Down"
        >
          ⬇️
        </button>
        <button
          style={buttonStyle}
          onClick={handleOrbitRight}
          onMouseDown={() => startRepeating('camera-orbit-right')}
          onTouchStart={() => startRepeating('camera-orbit-right')}
          onMouseUp={stopRepeating}
          onTouchEnd={stopRepeating}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          }}
          title="Orbit Right"
        >
          ➡️
        </button>

        {/* Row 3 */}
        <div></div>
        <div></div>
        <button
          style={buttonStyle}
          onClick={handleZoomOut}
          onMouseDown={() => startRepeating('camera-zoom-out')}
          onTouchStart={() => startRepeating('camera-zoom-out')}
          onMouseUp={stopRepeating}
          onTouchEnd={stopRepeating}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          }}
          title="Zoom Out"
        >
          🔍-
        </button>
        <div></div>
      </div>
    </>
  );
}

export default CameraControls; 