#!/bin/bash

# FrontRow Modal Test Startup Script

echo "🚀 Starting FrontRow Modal Test Environment"

# Check if server is running
if ! curl -s http://localhost:3001 > /dev/null; then
    echo "📡 Starting FrontRow server..."
    cd server && npm start &
    SERVER_PID=$!
    cd ..
    
    # Wait for server to start
    echo "⏳ Waiting for server to start..."
    sleep 3
else
    echo "✅ Server already running on localhost:3001"
fi

# Start the modal app
echo "🖥️ Starting modal app..."
cd packages/modal-app && npm run dev &
MODAL_PID=$!
cd ../..

echo "✅ Modal test environment started!"
echo "📋 Server PID: $SERVER_PID"
echo "📋 Modal PID: $MODAL_PID"
echo ""
echo "🧪 To test the modal, run:"
echo "   python packages/modal-app/test-modal.py"
echo ""
echo "🛑 To stop everything, press Ctrl+C"

# Wait for user to stop
trap "echo '🛑 Stopping services...'; kill $SERVER_PID $MODAL_PID 2>/dev/null; exit" INT
wait 