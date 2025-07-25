# FrontRow Project - Claude Code Instructions

## Project Overview
FrontRow is a virtual theater experience with a React/Vite frontend and Node.js backend using WebRTC for real-time communication.

## Important Development Rules
- **NEVER kill or restart dev/backend servers** - User always keeps them running
- Always test changes with existing running servers
- Prefer editing existing files over creating new ones

## Architecture
- **Frontend**: React + Vite + Three.js (3D venue)
- **Backend**: Node.js + Socket.io + WebRTC
- **Deployment**: Netlify (frontend) + Render (backend)

## Key Directories
- `front-row-vite/` - React frontend application
- `server/` - Node.js backend with Socket.io
- Root level: deployment configs (netlify.toml, render.yaml)

## Development Commands
```bash
# Frontend (run from front-row-vite/)
npm run dev        # Start dev server
npm run build      # Build for production
npm run lint       # Run linting
npm run typecheck  # TypeScript checking

# Backend (run from server/)
npm start          # Start backend server
npm run dev        # Start with nodemon
```

## Deployment Configuration

### Netlify (Frontend)
- **Production**: master branch → https://frontrowtheater.netlify.app
- **Staging**: develop branch → branch deployment
- **Deploy Previews**: Pull requests
- Config: `netlify.toml` (base: front-row-vite/)

### Render (Backend) 
- **Production**: master branch → `frontrow-production`
- **Staging**: develop branch → `frontrow-staging`
- Config: `render.yaml` (rootDir: server/)

## Key Features Implemented

### Camera Capture System
- Live camera access with `getUserMedia()`
- Photo capture stored in Session Storage
- User photos displayed on 3D chair cubes
- Files: `CameraCapture.tsx`, `PhotoCube.tsx`, `UserInputForm.tsx`

### Audio System
- Applause plays only for audience (not performers)
- Performer detection via `isPerformer()` function
- Audio triggered 22 minutes after show goes live

### 3D Venue
- Three.js implementation with user chair cubes
- Photo textures mapped to all cube faces
- Real-time user positioning and interactions

## Environment Variables
- `VITE_BACKEND_URL` - Backend API endpoint
- `VITE_SOCKET_URL` - Socket.io connection URL
- Different URLs per environment (production/staging/preview)

## Testing Workflow
1. Make changes to code
2. Test with running dev servers
3. Run linting: `npm run lint`
4. Run type checking: `npm run typecheck`
5. Commit and push to develop for staging deploy
6. Merge to master for production deploy

## WebRTC Implementation
- Peer-to-peer connections for real-time communication
- Separate performer and audience experiences
- Socket.io coordination for connection setup

## Session Storage Usage
- User photos stored as base64 data URLs
- Persistent across browser sessions
- Used for 3D venue photo display

## Common Issues & Solutions
- **Video disappearing**: React re-render issues - stabilize useCallback dependencies
- **Camera permissions**: Handle different browser scenarios with proper error messages
- **Build failures**: Check TypeScript errors and dependency issues