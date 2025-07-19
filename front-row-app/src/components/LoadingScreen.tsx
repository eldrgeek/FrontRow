
import React from 'react';
import { Html } from '@react-three/drei';
import './LoadingScreen.css'; // New CSS file for loading screen

function LoadingScreen(): JSX.Element {
  return (
    <Html fullscreen>
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading FRONT ROW...</p>
      </div>
    </Html>
  );
}

export default LoadingScreen;
