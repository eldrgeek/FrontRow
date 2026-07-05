import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './LoginPage.css';

export function LoginPage() {
  const { signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signInWithMagicLink(email);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-success">
            <h2>Check your email</h2>
            <p>We've sent a magic link to <strong>{email}</strong></p>
            <p>Click the link in your email to sign in. If you don't see it, check your spam folder.</p>
            <button
              onClick={() => {
                setSubmitted(false);
                setEmail('');
              }}
              className="btn-back-to-form"
            >
              ← Try another email
            </button>
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
          <p className="login-subtitle">Sign in with a magic link</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}

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
              autoFocus
            />
          </div>

          <button type="submit" disabled={loading || !email} className="btn-sign-in">
            {loading ? 'Sending magic link...' : 'Sign in with magic link'}
          </button>
        </form>

        <div className="login-info">
          <p className="info-text">
            We'll send you a magic link via email. No password needed.
          </p>
        </div>
      </div>
    </div>
  );
}
