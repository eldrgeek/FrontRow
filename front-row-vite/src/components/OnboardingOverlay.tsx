import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'frontrow_onboarding_seen';

interface Step {
  title: string;
  description: string;
  icon: string;
  role: string;
}

const steps: Step[] = [
  {
    title: 'Audience',
    description: 'Enter your name, take a photo, pick a seat, and enjoy the show. Use reaction buttons to clap, laugh, or cheer during the performance.',
    icon: '💺',
    role: 'audience',
  },
  {
    title: 'Performer',
    description: 'Go to /backstage to preview your camera and audio. When ready, hit Go Live to make your entrance on stage. Use arrow keys to move around.',
    icon: '🎤',
    role: 'performer',
  },
  {
    title: 'House Manager',
    description: 'Visit /housemanager to configure the venue: set seat count, arrangement, curtain style, and show title. Open/close curtains and lock config during the show.',
    icon: '🏠',
    role: 'housemanager',
  },
];

export default function OnboardingOverlay(): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  const step = steps[currentStep];

  return (
    <div
      data-testid="onboarding-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200000,
        fontFamily: 'sans-serif',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        borderRadius: 16,
        border: '1px solid rgba(255,215,0,0.3)',
        padding: '36px 40px',
        maxWidth: 460,
        width: '90vw',
        color: 'white',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }}>
        <h2 style={{ margin: '0 0 8px', color: '#ffd700', fontSize: 22 }}>
          Welcome to FrontRow
        </h2>
        <p style={{ margin: '0 0 24px', opacity: 0.6, fontSize: 13 }}>
          A virtual theater experience. Here's how the three roles work:
        </p>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {steps.map((s, i) => (
            <button
              key={i}
              onClick={() => setCurrentStep(i)}
              style={{
                flex: 1,
                padding: '8px 4px',
                borderRadius: 8,
                border: i === currentStep ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.15)',
                background: i === currentStep ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)',
                color: 'white',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: i === currentStep ? 700 : 400,
                transition: 'all 0.2s',
              }}
            >
              <span style={{ display: 'block', fontSize: 20 }}>{s.icon}</span>
              {i + 1}. {s.title}
            </button>
          ))}
        </div>

        {/* Current step detail */}
        <div style={{
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 10,
          padding: '20px 24px',
          marginBottom: 24,
          minHeight: 80,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            {step.icon} {step.title}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.85 }}>
            {step.description}
          </div>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              background: currentStep === 0 ? '#333' : 'rgba(255,255,255,0.15)',
              color: currentStep === 0 ? '#666' : 'white',
              cursor: currentStep === 0 ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: 12, opacity: 0.5 }}>
            {currentStep + 1} / {steps.length}
          </span>
          {currentStep < steps.length - 1 ? (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                background: '#ffd700',
                color: '#000',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              Next
            </button>
          ) : (
            <button
              onClick={dismiss}
              data-testid="onboarding-dismiss"
              style={{
                padding: '8px 20px',
                borderRadius: 6,
                border: 'none',
                background: '#28a745',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              Got it!
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
