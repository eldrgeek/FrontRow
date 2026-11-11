import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
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
import { BoxOffice } from './components/BoxOffice';
import { installSomaFeedbackIdentityHook } from './lib/somaFeedbackIdentity';
import { installSomaFeedbackAuthHook } from './lib/somaFeedbackAuth';
import { installGlobalErrorHandlers } from './lib/errorReport';
import App from './App';
import { configureTextBuilder } from 'troika-three-text';
import HouseManagerApp from './HouseManagerApp';
import BackstageRoom from './BackstageRoom';
import { InvitePage, TicketPage } from './theater/FrontOfHouse';
import { LobbyPage } from './theater/Lobby';
import { HallwayPage } from './theater/Hallway';
import { ShelfPage } from './theater/Shelf';
import { HousePage } from './theater/House';
import { StageCameraPage } from './theater/StageCamera';
import { GreenRoomPage } from './theater/GreenRoomPage';
import { BuilderPage } from './builder/BuilderPage';
import { BuyPage, BuyThanksPage } from './theater/BuyPage';
import { WatchPage, WatchResultsPage } from './watch/WatchPage';

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

// 3D text (seat names, the stage stencil) uses a font shipped with the site.
// Without this, troika fetches font data from cdn.jsdelivr.net at runtime and
// the whole theater stays on its loading spinner wherever that CDN is blocked.
configureTextBuilder({ defaultFontURL: '/fonts/playfair-display-latin-700-normal.woff' });

// Router wrapper that requires auth setup
function AppRoutes() {
  const { loading } = useAuth();
  const { pathname } = useLocation();
  // The front of house needs no account, so it never waits on the auth check.
  const isFrontOfHouse = pathname === '/' || pathname === '/show' || pathname.startsWith('/show/') || pathname.startsWith('/buy/')
    || (pathname.startsWith('/watch/') && !pathname.endsWith('/results'));

  if (loading && !isFrontOfHouse) {
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

      {/* Front of house: invitation, ticket, lobby, house. No account. */}
      <Route path="/" element={<InvitePage />} />
      <Route path="/show/:slug" element={<InvitePage />} />
      <Route path="/show/:slug/ticket" element={<TicketPage />} />
      <Route path="/buy/thanks" element={<BuyThanksPage />} />
      <Route path="/buy/:venue/:room/:performance" element={<BuyPage />} />
      <Route path="/show/:slug/lobby" element={<LobbyPage />} />
      <Route path="/show/:slug/hallway" element={<HallwayPage />} />
      <Route path="/show/:slug/revolution" element={<ShelfPage which="revolution" />} />
      <Route path="/show/:slug/library" element={<ShelfPage which="library" />} />
      <Route path="/show/:slug/shelf/:screenId" element={<ShelfPage />} />
      <Route path="/show/:slug/house" element={<HousePage />} />
      <Route path="/show/:slug/green-room" element={<GreenRoomPage />} />
      {/* A performer's second camera (a phone on the boards), from the green room's QR code. */}
      <Route path="/show/:slug/stage-camera" element={<StageCameraPage />} />
      {/* Theater kit: the builder, with a SOMA room for the people and AIs designing it. */}
      <Route path="/build/:theater" element={<BuilderPage />} />
      {/* Our videos with scene-by-scene thumbs; the results are for admins. */}
      <Route path="/watch/:video" element={<WatchPage />} />
      <Route path="/watch/:video/results" element={<WatchResultsPage />} />

      {/* Protected routes */}
      <Route
        path="/venues"
        element={
          <ProtectedRoute>
            <Lobby />
          </ProtectedRoute>
        }
      />
      {/* Box office: the server decides who may manage which theater */}
      <Route
        path="/box-office"
        element={
          <ProtectedRoute>
            <BoxOffice />
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
