import React from 'react';

function TestApp(): JSX.Element {
  console.log('TestApp is rendering!');
  
  return (
    <div style={{ padding: '20px', backgroundColor: '#f0f0f0', minHeight: '100vh' }}>
      <h1 style={{ color: 'red' }}>React is Working!</h1>
      <p>If you can see this, React is rendering properly.</p>
      <button onClick={() => alert('Button clicked!')}>Test Button</button>
    </div>
  );
}

export default TestApp; 