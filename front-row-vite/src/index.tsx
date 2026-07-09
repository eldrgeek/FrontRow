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
import ErrorBoundary from './components/ErrorBoundary';
import { FeedbackQueue } from './components/FeedbackQueue';
import { installSomaFeedbackIdentityHook } from './lib/somaFeedbackIdentity';
import { installSomaFeedbackAuthHook } from './lib/somaFeedbackAuth';
import { installGlobalErrorHandlers } from './lib/errorReport';
import App from './App';
import HouseManagerApp from './HouseManagerApp';
import BackstageRoom from './BackstageRoom';

// SOMA feedback stack — boot wiring (must run before render):
//  - identity/auth hooks let the soma-feedback widget autofill the signed-in
//    user and carry their Supabase bearer so the intake function can verify
//    is_app_admin('frontrow').
//  - global error handlers report uncaught window errors / rejections to the
//    SOMA error intake service (inert in prod until soma-errors is deployed;
//    fail-soft by contract).
installSomaFeedbackIdentityHook();
installSomaFeedbackAuthHook();
installGlobalErrorHandlers();

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
      <Route
        path="/admin/feedback"
        element={
          <AdminRoute>
            <FeedbackQueue />
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
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

// Export for module identity
export {};
