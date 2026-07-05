import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/LoginPage';
import { AuthCallback } from './components/AuthCallback';
import { Lobby } from './components/Lobby';
import { AdminDashboard } from './components/AdminDashboard';
import { DelegationSettings } from './components/DelegationSettings';
import { Room } from './components/Room';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import App from './App';
import HouseManagerApp from './HouseManagerApp';
import BackstageRoom from './BackstageRoom';

// Router wrapper that requires auth setup
function AppRoutes() {
  const { loading } = useAuth();

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</div>;
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Legacy routes */}
      <Route path="/housemanager" element={<HouseManagerApp />} />
      <Route path="/backstage" element={<BackstageRoom />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Lobby />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <DelegationSettings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/venue/:venueId"
        element={
          <ProtectedRoute>
            <Room />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        }
      />

      {/* Catch-all for legacy App */}
      <Route path="*" element={<App />} />
    </Routes>
  );
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Export for module identity
export {};
