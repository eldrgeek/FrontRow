import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './LoginPage.css';

type Mode = 'signin' | 'signup';
type Method = 'password' | 'magic';

export function LoginPage() {
  const {
    signInWithMagicLink,
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
  } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [method, setMethod] = useState<Method>('password');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      // Redirects away to Google; nothing else runs here on success.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (method === 'magic') {
        await signInWithMagicLink(email);
        setMagicSent(true);
      } else if (mode === 'signup') {
        const { needsConfirmation } = await signUpWithPassword(name, email, password);
        if (needsConfirmation) setConfirmSent(true);
        // If confirmation is off, the auth state change signs the user in.
      } else {
        await signInWithPassword(email, password);
        // onAuthStateChange takes over and routes into the app.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  function resetFlow() {
    setMagicSent(false);
    setConfirmSent(false);
    setError(null);
    setPassword('');
  }

  if (magicSent) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-success">
            <h2>Check your email</h2>
            <p>We've sent a magic link to <strong>{email}</strong></p>
            <p>Click the link in your email to sign in. If you don't see it, check your spam folder.</p>
            <button onClick={resetFlow} className="btn-back-to-form">← Back to sign in</button>
          </div>
        </div>
      </div>
    );
  }

  if (confirmSent) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-success">
            <h2>Confirm your email</h2>
            <p>We've sent a confirmation link to <strong>{email}</strong></p>
            <p>Click the link to finish creating your account. If you don't see it, check your spam folder.</p>
            <button onClick={resetFlow} className="btn-back-to-form">← Back to sign in</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>FrontRow</h1>
          <p className="login-subtitle">
            {mode === 'signup' ? 'Create your account' : 'Sign in to your account'}
          </p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="btn-google"
        >
          <svg className="google-icon" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58z" />
          </svg>
          Continue with Google
        </button>

        <div className="login-divider"><span>or</span></div>

        <form onSubmit={handleSubmit} className="login-form">
          {mode === 'signup' && method === 'password' && (
            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
                disabled={loading}
                autoFocus
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              disabled={loading}
            />
          </div>

          {method === 'password' && (
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                required
                minLength={6}
                disabled={loading}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>
          )}

          <button type="submit" disabled={loading || !email} className="btn-sign-in">
            {loading
              ? 'Please wait…'
              : method === 'magic'
              ? 'Send magic link'
              : mode === 'signup'
              ? 'Create account'
              : 'Sign in'}
          </button>
        </form>

        <div className="login-alt-actions">
          {method === 'password' ? (
            <button type="button" className="link-button" onClick={() => { setMethod('magic'); setError(null); }}>
              Email me a magic link instead
            </button>
          ) : (
            <button type="button" className="link-button" onClick={() => { setMethod('password'); setError(null); }}>
              Use a password instead
            </button>
          )}
        </div>

        <div className="login-footer">
          {mode === 'signin' ? (
            <p>
              New to FrontRow?{' '}
              <button type="button" className="link-button" onClick={() => { setMode('signup'); setMethod('password'); setError(null); }}>
                Create an account
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button type="button" className="link-button" onClick={() => { setMode('signin'); setError(null); }}>
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
