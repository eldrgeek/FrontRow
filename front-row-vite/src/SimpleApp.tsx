import React, { useState } from 'react';
// Import only basic React for now
import './App.css';

function SimpleApp(): JSX.Element {
  const [test, setTest] = useState<string>('FRONT ROW App Loading...');

  return (
    <div className="App">
      <header style={{ padding: '20px', textAlign: 'center' }}>
        <h1>{test}</h1>
        <button onClick={() => setTest('React State Working!')}>
          Test React State
        </button>
        <p>Next step: Add Three.js components...</p>
      </header>
    </div>
  );
}

export default SimpleApp; 