
import React from 'react';
import './LoadingScreen.css'; // CSS file for loading screen

function LoadingScreen(): JSX.Element {
  return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Loading FRONT ROW...</p>
    </div>
  );
}

export default LoadingScreen;
