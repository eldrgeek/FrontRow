import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './AuthCallback.css';

export function AuthCallback() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (session?.user) {
        // Signed in, redirect to lobby
        navigate('/', { replace: true });
      } else {
        // Not signed in, go back to login
        navigate('/login', { replace: true });
      }
    }
  }, [session, loading, navigate]);

  return (
    <div className="auth-callback-container">
      <div className="spinner"></div>
      <p>Signing you in...</p>
    </div>
  );
}
