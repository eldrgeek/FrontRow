#!/bin/bash

echo "🚀 Starting FRONT ROW Development Servers..."
echo ""

# Function to handle cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    jobs -p | xargs -r kill
    exit 0
}

# Set up trap to call cleanup function on script exit
trap cleanup SIGINT SIGTERM EXIT

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}📊 Starting Backend Server (Node.js)...${NC}"
cd server && npm start &
BACKEND_PID=$!

echo -e "${GREEN}⚡ Starting Frontend Server (Vite + TypeScript)...${NC}"
cd ../front-row-vite && npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${YELLOW}✅ Both servers are starting up!${NC}"
echo ""
echo -e "${GREEN}🌐 Frontend (Vite):${NC} http://localhost:5173/"
echo -e "${GREEN}🔗 Artist Mode:${NC}    http://localhost:5173/?role=artist"
echo -e "${BLUE}⚙️  Backend API:${NC}     http://localhost:3001/"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop both servers${NC}"
echo ""

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID 