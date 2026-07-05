import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Protected route that requires authentication
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</div>;
  }

  if (!session?.user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Protected route that requires super admin
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, isSuperAdmin } = useAuth();

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</div>;
  }

  if (!session?.user || !isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// Router wrapper that requires auth setup
export function RouterConfig() {
  const { loading } = useAuth();

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</div>;
  }

  return null; // Placeholder, actual routing done in index.tsx
}
