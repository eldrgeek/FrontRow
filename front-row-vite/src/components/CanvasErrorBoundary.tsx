import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Wraps the 3D <Canvas>. If the scene throws during render (a WebGL/Three
 * error, a failed asset load, etc.), show the actual error instead of a
 * silent black screen — so the failure is diagnosable rather than mysterious.
 */
export default class CanvasErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('3D theater failed to render:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '24px',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h2 style={{ color: '#ffd700', marginBottom: 12 }}>🎭 The theater couldn't load</h2>
          <p style={{ maxWidth: 520, opacity: 0.9 }}>
            The 3D stage hit an error while starting up. Reloading usually fixes it.
          </p>
          <pre
            style={{
              maxWidth: 640,
              maxHeight: 160,
              overflow: 'auto',
              background: 'rgba(0,0,0,0.35)',
              padding: 12,
              borderRadius: 8,
              fontSize: 12,
              textAlign: 'left',
              margin: '16px 0',
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#d4af37',
              color: '#1a1a2e',
              border: 'none',
              borderRadius: 8,
              padding: '12px 28px',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            Reload the theater
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
