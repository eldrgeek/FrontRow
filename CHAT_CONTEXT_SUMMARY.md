# 🎭 FRONT ROW - Chat Context Summary

## 📋 Project Overview

**FRONT ROW** is a virtual theater application that enables live musical performances from artists to audiences via WebRTC streaming in a 3D environment. The application consists of:

- **Frontend**: React + TypeScript + Three.js (React Three Fiber) in `/front-row-vite/`
- **Backend**: Node.js + Express + Socket.IO in `/server/`
- **Deployment**: Ready for Netlify (frontend) + Render (backend)

---

## 🎯 Current Status

### ✅ **Completed Features**
- **3D Virtual Theater**: Working Three.js scene with seats and stage
- **WebRTC Streaming**: Artist can stream video/audio to audience members
- **Real-time Communication**: Socket.IO for signaling and seat management
- **User Flow**: Name/image input, seat selection, view switching
- **Local Storage**: Persistent user names and images
- **Recording**: Browser-based performance and experience recording
- **Deployment Setup**: Ready for production deployment

### 🔧 **Major Issues Identified**
- **Multi-tab State Conflicts**: Artist role shared across browser tabs via localStorage
- **WebRTC Connection Problems**: Duplicate connections, memory leaks, stale references
- **Seat Management Issues**: "Phantom" occupied seats from disconnected clients
- **Backend Cleanup**: Unreliable socket disconnect handling

---

## 🏗️ Architecture Overview

### Frontend Structure (`/front-row-vite/`)
```
src/
├── App.tsx                 # Main application logic & WebRTC management
├── config.ts              # Environment-based configuration
├── components/
│   ├── Stage.tsx          # 3D stage with video texture
│   ├── SeatSelection.tsx  # Interactive seat picking
│   ├── UserInputForm.tsx  # Name/image input
│   ├── PerformerView.tsx  # Artist camera preview
│   └── UserView.tsx       # Audience seat view
└── hooks/
    └── useVideoTexture.ts # WebRTC stream → Three.js texture
```

### Backend Structure (`/server/`)
```
server/
├── index.js              # Express server + Socket.IO signaling
├── package.json          # Dependencies (express, socket.io, cors)
└── Procfile              # Render deployment configuration
```

### Key Technologies
- **WebRTC**: Peer-to-peer video streaming (artist → audience)
- **Socket.IO**: Real-time signaling and seat management
- **Three.js/R3F**: 3D theater environment
- **TypeScript**: Type safety throughout frontend

---

## 🔍 Detailed Issue Analysis

### 1. **Artist Role Management Problem**
```typescript
// CURRENT (PROBLEMATIC):
const [isArtist, setIsArtist] = useState(() => {
  return localStorage.getItem('frontrow_is_artist') === 'true';
});
```

**Issue**: Artist role is shared across all browser tabs
**Impact**: Multiple tabs can become "artist" simultaneously, breaking WebRTC flow

### 2. **WebRTC Connection Management**
```typescript
// CURRENT (PROBLEMATIC):
socketRef.current.on('new-audience-member', async (audienceSocketId) => {
  const pc = new RTCPeerConnection({ iceServers: stunServers });
  peerConnectionsRef.current[audienceSocketId] = pc; // No deduplication check
});
```

**Issues**:
- No check for existing connections → duplicates created
- No cleanup on disconnect → memory leaks
- Stale socket IDs persist in connection map

### 3. **Backend State Management**
```javascript
// CURRENT (PROBLEMATIC):
socket.on('disconnect', () => {
  // Cleanup code - but 'disconnect' isn't always fired
});
```

**Issues**:
- Browser tab close doesn't always trigger 'disconnect' event
- No heartbeat mechanism to detect stale connections
- Seats remain "occupied" by disconnected clients

---

## 🚀 Deployment Configuration

### Production URLs (After Deployment)
- **Frontend**: `https://frontrow-theater.netlify.app` (Netlify)
- **Backend**: `https://frontrow-backend.onrender.com` (Render)

### Environment Variables Setup

**Netlify (Frontend):**
```bash
VITE_SOCKET_URL=https://frontrow-backend.onrender.com
VITE_BACKEND_URL=https://frontrow-backend.onrender.com
NODE_VERSION=18
```

**Render (Backend):**
```bash
NODE_ENV=production
ALLOWED_ORIGINS=https://frontrow-theater.netlify.app
PORT=10000
```

### Deployment Files Created
- `server/Procfile` - Render start command
- `render.yaml` - Render service configuration
- `front-row-vite/.env.example` - Environment variable template
- Updated `front-row-vite/src/config.ts` - Environment-based configuration

---

## 🎯 Immediate Next Steps

### Phase 1: Critical Fixes
1. **Fix Artist Role**: Use sessionStorage + URL params instead of localStorage
2. **Add Connection Deduplication**: Prevent duplicate WebRTC connections
3. **Implement Backend Heartbeat**: Detect and cleanup stale connections

### Phase 2: State Management
4. **Separate User Profile from Artist Status**: Different storage strategies
5. **Add Connection State Management**: Centralized connection tracking
6. **Implement Proper Cleanup**: beforeunload handlers and connection closing

### Phase 3: Testing & Monitoring
7. **Multi-tab Testing**: Comprehensive test cases for role isolation
8. **Debug Logging**: Development-mode connection state logging
9. **Health Monitoring**: Real-time connection status tracking

---

## 📂 Important Files to Know

### Core Application Logic
- `front-row-vite/src/App.tsx` - Main app, WebRTC management, Socket.IO setup
- `front-row-vite/src/config.ts` - Environment configuration
- `server/index.js` - Backend signaling server

### WebRTC Implementation
- `App.tsx` lines 291-366 - Artist stream setup and peer connections
- `App.tsx` lines 133-168 - WebRTC signaling listeners
- `hooks/useVideoTexture.ts` - MediaStream to Three.js texture conversion

### State Management
- `App.tsx` lines 47-91 - State initialization with localStorage
- `components/UserInputForm.tsx` - User profile persistence
- `server/index.js` lines 44-54 - Backend in-memory state

### Deployment Configuration
- `render.yaml` - Backend deployment to Render
- `front-row-vite/netlify.toml` - Frontend deployment to Netlify
- `server/Procfile` - Process configuration

---

## 🧪 Testing Scenarios

### Multi-Tab Issues Reproduced
1. Open Tab A, enter name, select seat
2. Open Tab B, enter different name
3. Tab A switches to artist mode (localStorage.frontrow_is_artist = true)
4. Tab B also becomes artist (shares localStorage)
5. Both tabs show artist controls, WebRTC signaling breaks

### Backend State Issues
1. Audience member selects seat, backend stores socket-123 → seat-1
2. Tab refreshes, new socket-456 connects
3. Backend still shows seat-1 occupied by socket-123 (doesn't exist)
4. New user can't select seat-1 because backend thinks it's taken

### Expected Behavior After Fixes
1. Artist URL: `app.com/?role=artist` → only this tab is artist
2. Audience URL: `app.com/` → audience mode
3. Disconnected seats clear automatically after timeout
4. WebRTC connections deduplicated and cleaned up properly

---

## 💡 Development Commands

### Local Development
```bash
# Backend (Terminal 1)
cd server && npm start              # http://localhost:3001

# Frontend (Terminal 2) 
cd front-row-vite && npm run dev   # http://localhost:5173
```

### Testing
```bash
# Backend API tests
python tests/backend_api_in_memory.py

# Frontend E2E tests (requires servers running)
python tests/auto_test.py
```

### Deployment Prep
```bash
# Test build locally
cd front-row-vite && npm run build

# Push to trigger deployments
git push origin master
```

---

## 🔧 Technical Debt & TODOs

### High Priority
- [ ] Fix localStorage artist role sharing between tabs
- [ ] Add WebRTC connection deduplication
- [ ] Implement backend heartbeat mechanism
- [ ] Add proper peer connection cleanup

### Medium Priority  
- [ ] Separate user profile from artist status storage
- [ ] Add connection state management interface
- [ ] Implement seat timeout mechanism
- [ ] Add comprehensive error handling

### Low Priority
- [ ] Connection health monitoring UI
- [ ] Advanced debugging and logging
- [ ] Performance optimization
- [ ] TURN server integration for better NAT traversal

---

## 📚 Key Documents Created

1. **`WEBRTC_ANALYSIS_AND_REMEDIATION_PLAN.md`** - Comprehensive technical analysis
2. **`DEPLOYMENT_GUIDE.md`** - Step-by-step production deployment
3. **`DEPLOYMENT_SUMMARY.md`** - Quick deployment reference
4. **`CHAT_CONTEXT_SUMMARY.md`** - This document

---

## 🎭 Project Goals & Vision

### Current Scope (Rev 1)
- Intimate virtual theater experience
- Single artist streaming to multiple audience members
- Real-time seat selection and management
- Browser-based recording capabilities

### Future Enhancements (Rev 2+)
- Multiple simultaneous artists
- Persistent show scheduling with database
- Enhanced audio/video quality controls
- Screen sharing capabilities
- Server-side recording and playback

---

## ⚡ Quick Context for New Chats

**What we're building**: Virtual theater with WebRTC streaming from artist to audience in a 3D environment.

**Current problem**: Multi-tab testing reveals state conflicts (artist role) and WebRTC connection issues (duplicates, memory leaks, stale seats).

**Solution approach**: Use sessionStorage+URL for artist role, add connection deduplication, implement backend heartbeat for cleanup.

**Deployment status**: Ready for Render (backend) + Netlify (frontend) with proper environment configuration.

**Next milestone**: Fix multi-tab issues and deploy to production for real-world testing. 