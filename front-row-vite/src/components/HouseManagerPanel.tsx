import React from 'react';
import type { VenueConfig } from '../HouseManagerApp';

interface HouseManagerPanelProps {
  venueConfig: VenueConfig;
  onConfigChange: (updates: Partial<VenueConfig>) => void;
  onCurtain: (action: 'open' | 'close') => void;
}

const panelStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(12px)',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.15)',
  padding: '28px 32px',
  width: 420,
  maxWidth: '95vw',
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  color: 'white',
  fontFamily: 'sans-serif',
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'rgba(255,255,255,0.7)',
  marginBottom: 4,
  display: 'block',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.08)',
  color: 'white',
  fontSize: 14,
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = { ...inputStyle };

const btnStyle = (color: string, disabled = false): React.CSSProperties => ({
  padding: '10px 20px',
  borderRadius: 7,
  border: 'none',
  background: disabled ? '#555' : color,
  color: 'white',
  fontWeight: 700,
  fontSize: 14,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1,
});

export default function HouseManagerPanel({ venueConfig, onConfigChange, onCurtain }: HouseManagerPanelProps): JSX.Element {
  const locked = venueConfig.configLocked;

  return (
    <div style={panelStyle} data-testid="hm-panel">
      <h3 style={{ margin: 0, color: '#ffd700', fontSize: 18 }}>🏠 Venue Configuration</h3>

      {/* Seat Count */}
      <div>
        <label style={labelStyle}>
          Seat Count: <strong style={{ color: 'white' }}>{venueConfig.seatCount}</strong>
        </label>
        <input
          type="range"
          min={4}
          max={50}
          value={venueConfig.seatCount}
          disabled={locked}
          data-testid="seat-count-slider"
          style={{ width: '100%', cursor: locked ? 'not-allowed' : 'pointer' }}
          onChange={e => onConfigChange({ seatCount: Number(e.target.value) })}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.5 }}>
          <span>4</span><span>50</span>
        </div>
      </div>

      {/* Arrangement */}
      <div>
        <label style={labelStyle}>Seating Arrangement</label>
        <select
          value={venueConfig.arrangement}
          disabled={locked}
          style={selectStyle}
          data-testid="arrangement-select"
          onChange={e => onConfigChange({ arrangement: e.target.value as VenueConfig['arrangement'] })}
        >
          <option value="orchestra">🎻 Orchestra Row</option>
          <option value="semicircle">🌙 Semicircle</option>
          <option value="cabaret">🍸 Cabaret Round Tables</option>
          <option value="classroom">📚 Classroom Rows</option>
        </select>
      </div>

      {/* Curtain Style */}
      <div>
        <label style={labelStyle}>Curtain Style</label>
        <select
          value={venueConfig.curtainStyle}
          style={selectStyle}
          data-testid="curtain-style-select"
          onChange={e => onConfigChange({ curtainStyle: e.target.value })}
        >
          <option value="velvet-red">🔴 Velvet Red</option>
          <option value="none">⬛ None</option>
          <option value="#1a1a2e">🔵 Deep Navy</option>
          <option value="#2d5016">🟢 Forest Green</option>
          <option value="#4a0e2b">🟣 Burgundy</option>
        </select>
      </div>

      {/* Show Title */}
      <div>
        <label style={labelStyle}>Show Title</label>
        <input
          type="text"
          value={venueConfig.showTitle}
          placeholder="Enter show title..."
          disabled={locked}
          style={inputStyle}
          data-testid="show-title-input"
          onChange={e => onConfigChange({ showTitle: e.target.value })}
        />
      </div>

      {/* Scheduled Start */}
      <div>
        <label style={labelStyle}>Scheduled Start (optional)</label>
        <input
          type="datetime-local"
          value={venueConfig.scheduledStart ?? ''}
          disabled={locked}
          style={inputStyle}
          data-testid="scheduled-start-input"
          onChange={e => onConfigChange({ scheduledStart: e.target.value || null })}
        />
      </div>

      {/* Curtain Controls */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          style={btnStyle('#8B4513', venueConfig.curtainOpen)}
          disabled={venueConfig.curtainOpen}
          data-testid="curtain-close-btn"
          onClick={() => onCurtain('close')}
        >
          🎭 Close Curtains
        </button>
        <button
          style={btnStyle('#2d7a2d', !venueConfig.curtainOpen)}
          disabled={!venueConfig.curtainOpen}
          data-testid="curtain-open-btn"
          onClick={() => onCurtain('open')}
        >
          🎬 Open Curtains
        </button>
      </div>

      {/* Lock Config */}
      <button
        style={btnStyle(locked ? '#dc3545' : '#6c3483')}
        data-testid="lock-config-btn"
        onClick={() => onConfigChange({ configLocked: !locked })}
      >
        {locked ? '🔓 Unlock Config' : '🔒 Lock Config'}
      </button>

      {locked && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(220,53,69,0.2)',
          borderRadius: 6,
          border: '1px solid rgba(220,53,69,0.4)',
          fontSize: 12,
          color: '#ff8888',
        }}>
          ⚠️ Config locked — seat count changes disabled while show is active.
        </div>
      )}
    </div>
  );
}
