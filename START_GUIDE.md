# 🚀 FRONT ROW - Quick Start Guide

## **One-Command Development Setup**

### ✨ **Option 1: Using npm scripts (Recommended)**

```bash
# Start both frontend and backend servers
npm run dev
```

### ✨ **Option 2: Using shell script**

```bash
# Start both servers with the shell script
./start-dev.sh
```

### 📋 **Available Commands**

```bash
# Development
npm run dev              # Start both frontend & backend servers
npm run frontend         # Start only Vite frontend server
npm run backend          # Start only Node.js backend server

# Setup
npm run install-all      # Install dependencies for both projects

# Production
npm run build           # Build frontend for production

# Testing
npm run test            # Run automated tests
```

## 🌐 **Access Points**

Once started, access your application at:

- **Main App**: http://localhost:5173/
- **Artist Mode**: http://localhost:5173/?role=artist
- **Backend API**: http://localhost:3001/

## 🛠 **Manual Setup (Alternative)**

If you prefer to run servers manually:

```bash
# Terminal 1 - Backend
cd server
npm start

# Terminal 2 - Frontend  
cd front-row-vite
npm run dev
```

## 🔧 **First Time Setup**

If this is your first time running the project:

```bash
# Install all dependencies
npm run install-all

# Then start development
npm run dev
```

## 📱 **Project Features**

Your FRONT ROW application includes:

- ⚡ **Vite + TypeScript** - Lightning fast development
- 🎭 **3D Virtual Theater** - Three.js powered environment  
- 📹 **WebRTC Streaming** - Real-time video between artist and audience
- 💺 **Live Seat Selection** - Socket.IO powered real-time updates
- 🎬 **Recording Capabilities** - Browser-based performance recording
- 👁️ **Multiple Views** - Eye-in-sky, performer, and user perspectives

## 🔥 **Hot Reload**

Both servers support hot reload:
- **Frontend**: Instant React component updates
- **Backend**: Automatic server restart on file changes

## 🛑 **Stopping Servers**

- **npm run dev**: Press `Ctrl+C`
- **Shell script**: Press `Ctrl+C` (cleanly stops both servers)

---

**🎉 You're ready to develop! Open http://localhost:5173/ and start building your virtual theater experience!** 