import React, { useState, useEffect } from 'react';

interface VolumeControlProps {
  onVolumeChange?: (volume: number) => void;
}

function VolumeControl({ onVolumeChange }: VolumeControlProps): JSX.Element {
  const [volume, setVolume] = useState<number>(70); // Default to 70%
  const [isMuted, setIsMuted] = useState<boolean>(false);

  useEffect(() => {
    // Load saved volume from localStorage
    const savedVolume = localStorage.getItem('frontrow_volume');
    const savedMuted = localStorage.getItem('frontrow_muted');
    
    if (savedVolume) {
      const vol = parseInt(savedVolume, 10);
      setVolume(vol);
      if (onVolumeChange) onVolumeChange(vol);
    }
    
    if (savedMuted === 'true') {
      setIsMuted(true);
    }
  }, [onVolumeChange]);

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    localStorage.setItem('frontrow_volume', newVolume.toString());
    if (onVolumeChange) onVolumeChange(newVolume);
    
    // Unmute if volume is changed from 0
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
      localStorage.setItem('frontrow_muted', 'false');
    }
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    localStorage.setItem('frontrow_muted', newMuted.toString());
    if (onVolumeChange) onVolumeChange(newMuted ? 0 : volume);
  };

  return (
    <div className="volume-control" style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'rgba(0, 0, 0, 0.9)',
      padding: '15px 20px',
      borderRadius: '15px',
      border: '2px solid rgba(255, 255, 255, 0.3)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      display: 'flex',
      alignItems: 'center',
      gap: '15px',
      minWidth: '200px',
      zIndex: 9996
    }}>
      <button
        onClick={toggleMute}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'white',
          fontSize: '1.2em',
          cursor: 'pointer',
          padding: '5px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          transition: 'background 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? '🔇' : volume === 0 ? '🔈' : volume < 50 ? '🔉' : '🔊'}
      </button>
      
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ color: 'white', fontSize: '0.9em', minWidth: '20px' }}>
          {isMuted ? '0' : volume}
        </span>
        <input
          type="range"
          min="0"
          max="100"
          value={isMuted ? 0 : volume}
          onChange={(e) => handleVolumeChange(parseInt(e.target.value, 10))}
          style={{
            flex: 1,
            height: '6px',
            borderRadius: '3px',
            background: `linear-gradient(to right, #007bff 0%, #007bff ${isMuted ? 0 : volume}%, rgba(255,255,255,0.3) ${isMuted ? 0 : volume}%, rgba(255,255,255,0.3) 100%)`,
            outline: 'none',
            cursor: 'pointer'
          }}
          title={`Volume: ${isMuted ? 0 : volume}%`}
        />
      </div>
    </div>
  );
}

export default VolumeControl; 