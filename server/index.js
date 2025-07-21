
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Get allowed origins from environment variable for production
const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    // In production, use specific origins from environment variable
    const envOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
    // Always allow localhost for testing during development
    const origins = [
      ...envOrigins,
      'http://localhost:5173',
      'http://localhost:3000',
      'https://localhost:5173'
    ].filter(Boolean);
    console.log('Production mode - Allowed origins:', origins);
    return origins;
  } else {
    // In development, allow all origins
    console.log('Development mode - Allowing all origins');
    return "*";
  }
};

const io = new Server(server, {
  cors: {
    origin: getAllowedOrigins(),
    methods: ["GET", "POST"],
    credentials: false
  }
});

// --- MIDDLEWARE AND CORS ---
app.use(cors({
  origin: getAllowedOrigins(),
  credentials: false
}));
app.use(express.json({ limit: '5mb' })); // Allows larger JSON bodies for Base64 image strings

// --- IN-MEMORY STORES FOR REV 1 ---
// Data will be lost on server restart. Persistence is for Rev 2.
const scheduledShows = []; // { id, artistId, title, dateTime, status: 'scheduled' | 'live' | 'ended' }
let activeShow = {
  artistId: null,
  startTime: null,
  status: 'idle', // 'idle', 'pre-show', 'live', 'post-show'
  audienceSeats: {}, // { seatId: { name, imageUrl (base64 string), socketId } }
  countdown: {
    isActive: false,
    timeRemaining: 0,
    totalTime: 0,
    interval: null
  }
};
const userProfiles = {}; // { socketId: { name, imageUrl (base64 string), selectedSeat } } // Temporary store for connected users

// --- API Routes ---

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    version: '1.2.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    activeConnections: io.engine.clientsCount || 0,
    showStatus: activeShow.status,
    artistId: activeShow.artistId,
    audienceCount: Object.keys(activeShow.audienceSeats).length,
    countdown: activeShow.countdown
  });
});

// Development Dashboard endpoint
app.get('/dashboard', (req, res) => {
  const isDev = process.env.NODE_ENV !== 'production';
  const dashboardHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎭 FRONT ROW - Development Dashboard</title>
    <style>
        body {
            font-family: 'Monaco', 'Menlo', monospace;
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            color: white;
            margin: 0;
            padding: 20px;
            min-height: 100vh;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .status-card {
            background: rgba(0,0,0,0.3);
            border-radius: 10px;
            padding: 20px;
            border: 2px solid rgba(255,255,255,0.2);
        }
        .status-card h3 {
            margin-top: 0;
            color: #ffd700;
        }
        .status {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
        }
        .status.online { background: #28a745; }
        .status.offline { background: #dc3545; }
        .btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 5px;
            cursor: pointer;
            margin: 5px;
            text-decoration: none;
            display: inline-block;
        }
        .btn:hover { background: #0056b3; }
        .logs {
            background: rgba(0,0,0,0.5);
            border-radius: 10px;
            padding: 20px;
            height: 400px;
            overflow-y: auto;
            font-family: 'Monaco', monospace;
            font-size: 12px;
        }
        .log-entry {
            margin: 2px 0;
            padding: 2px;
        }
        .log-info { color: #17a2b8; }
        .log-warning { color: #ffc107; }
        .log-error { color: #dc3545; }
        .log-success { color: #28a745; }
        .env-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: bold;
            background: ${isDev ? '#ffc107' : '#28a745'};
            color: ${isDev ? '#000' : '#fff'};
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎭 FRONT ROW Development Dashboard</h1>
        <p>Real-time monitoring and environment management</p>
        <div class="env-badge">${process.env.NODE_ENV || 'development'}</div>
    </div>

    <div class="status-grid">
        <div class="status-card">
            <h3>📊 Backend Status</h3>
            <p><strong>URL:</strong> ${req.get('host')}</p>
            <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</p>
            <p><strong>Uptime:</strong> <span id="uptime">${Math.floor(process.uptime())}s</span></p>
            <p><strong>Active Connections:</strong> <span id="connections">${io.engine.clientsCount || 0}</span></p>
            <p><strong>Memory Usage:</strong> <span id="memory">${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB</span></p>
            <span class="status online">Online</span>
        </div>

        <div class="status-card">
            <h3>🏠 Local Development</h3>
            <p><strong>Frontend:</strong> http://localhost:5173</p>
            <p><strong>Backend:</strong> http://localhost:3001</p>
            <a href="http://localhost:5173" target="_blank" class="btn">Open Frontend</a>
            <a href="/health" target="_blank" class="btn">Health Check</a>
        </div>

        <div class="status-card">
            <h3>☁️ Production</h3>
            <p><strong>Frontend:</strong> https://frontrowtheater.netlify.app</p>
            <p><strong>Backend:</strong> https://frontrow-tvu6.onrender.com</p>
            <a href="https://frontrowtheater.netlify.app" target="_blank" class="btn">Open Production</a>
            <a href="https://frontrow-tvu6.onrender.com/health" target="_blank" class="btn">Prod Health</a>
        </div>

        <div class="status-card">
            <h3>📈 Show Status</h3>
            <p><strong>Current Status:</strong> <span id="show-status">live</span></p>
            <p><strong>Artist ID:</strong> <span id="artist-id">tQWCRbVpKu6803XSAAAP</span></p>
            <p><strong>Seated Audience:</strong> <span id="audience-count">0</span></p>
            <p><strong>Total Connected:</strong> <span id="total-connections">2</span></p>
            <button onclick="resetShow()" class="btn" style="background: #dc3545;">🔄 Reset Show</button>
            <button onclick="endShow()" class="btn" style="background: #ffc107; color: #000;">⏹️ End Show</button>
        </div>
    </div>

    <div class="logs">
        <h3>📋 Live Server Logs</h3>
        <div id="log-container">
            <div class="log-entry log-info">[${new Date().toLocaleTimeString()}] Dashboard loaded</div>
        </div>
    </div>

    <script>
        // Auto-refresh stats every 5 seconds
        setInterval(async () => {
            try {
                const response = await fetch('/health');
                const data = await response.json();
                document.getElementById('uptime').textContent = Math.floor(data.uptime) + 's';
                document.getElementById('connections').textContent = data.activeConnections;
                document.getElementById('total-connections').textContent = data.activeConnections;
                document.getElementById('memory').textContent = Math.round(10513456 / 1024 / 1024) + 'MB';
                
                // Update show status
                document.getElementById('show-status').textContent = data.showStatus;
                document.getElementById('audience-count').textContent = data.audienceCount;
                
                // Update artist ID if available
                if (data.artistId) {
                    document.getElementById('artist-id').textContent = data.artistId;
                }
            } catch (error) {
                console.error('Failed to fetch health data:', error);
            }
        }, 5000);

        // Simulate live logs
        const logContainer = document.getElementById('log-container');
        function addLog(message, type = 'info') {
            const entry = document.createElement('div');
            entry.className = 'log-entry log-' + type;
            entry.textContent = '[' + new Date().toLocaleTimeString() + '] ' + message;
            logContainer.appendChild(entry);
            logContainer.scrollTop = logContainer.scrollHeight;
            
            // Keep only last 50 log entries
            if (logContainer.children.length > 50) {
                logContainer.removeChild(logContainer.firstChild);
            }
        }

        // Simulate periodic status updates
        setInterval(() => {
            const messages = [
                'Heartbeat check completed',
                'Monitoring WebRTC connections', 
                'Checking seat availability',
                'Backend health check passed'
            ];
            if (Math.random() > 0.8) {
                addLog(messages[Math.floor(Math.random() * messages.length)], 'info');
            }
        }, 10000);

        // Show control functions
        async function resetShow() {
            try {
                const response = await fetch('/api/debug-reset-show', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const result = await response.json();
                addLog('Show reset: ' + result.message, 'success');
                setTimeout(() => location.reload(), 1000);
            } catch (error) {
                addLog('Failed to reset show: ' + error.message, 'error');
            }
        }

        async function endShow() {
            try {
                const response = await fetch('/api/end-show', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const result = await response.json();
                addLog('Show ended: ' + result.message, 'success');
                setTimeout(() => location.reload(), 1000);
            } catch (error) {
                addLog('Failed to end show: ' + error.message, 'error');
            }
        }
    </script>
</body>
</html>
  `;
  
  res.send(dashboardHTML);
});

// Get all scheduled shows
app.get('/api/shows', (req, res) => {
  res.json(scheduledShows);
});

// Artist schedules a new show (in-memory)
app.post('/api/shows', (req, res) => {
  const { artistId, title, dateTime } = req.body;
  if (!artistId || !title || !dateTime) {
      return res.status(400).json({ error: 'Missing required fields: artistId, title, dateTime' });
  }
  const newShow = { id: Date.now().toString(), artistId, title, dateTime, status: 'scheduled' };
  scheduledShows.push(newShow);
  io.emit('shows-updated', scheduledShows); // Notify all clients about updated schedule
  res.status(201).json(newShow);
  console.log(`New show scheduled: ${title} by ${artistId} at ${dateTime}`);
});

// Placeholder for artist to signal going live or ending show via API (for testing)
app.post('/api/artist-simulate-live', (req, res) => {
    // In a real scenario, this would come from an authenticated artist client
    if (activeShow.status !== 'idle' && activeShow.status !== 'pre-show') { // Allow from pre-show for testing
      return res.status(400).json({ error: 'Show already active or in invalid state.' });
    }
    activeShow.status = 'live';
    activeShow.artistId = 'simulated-artist'; // Placeholder ID
    activeShow.startTime = Date.now();
    io.emit('show-status-update', { status: 'live', artistId: activeShow.artistId });
    console.log('Simulated artist going LIVE!');
    res.status(200).json({ status: 'live' });
});

app.post('/api/artist-simulate-end', (req, res) => {
    if (activeShow.status !== 'live') {
      return res.status(400).json({ error: 'No active show to end.' });
    }
    activeShow.status = 'post-show';
    io.emit('show-status-update', { status: 'post-show' });
    console.log('Simulated artist ending show.');
    res.status(200).json({ status: 'post-show' });
    // Reset after a short delay
    setTimeout(() => {
        // Clear audience seats
        for (const seatId in activeShow.audienceSeats) {
            delete activeShow.audienceSeats[seatId];
        }
        // Clear user profiles
        for (const socketId in userProfiles) {
            delete userProfiles[socketId];
        }
        io.emit('all-seats-empty');
        activeShow.status = 'idle';
        console.log('Show cycle reset to idle after post-show.');
    }, 5000); // 5 seconds post-show display
});

// Debug API endpoint to reset show state
app.post('/api/debug-reset-show', (req, res) => {
  console.log('🔧 Debug: Resetting show state to idle');
  activeShow = {
    artistId: null,
    startTime: null,
    status: 'idle',
    audienceSeats: {}
  };
  io.emit('show-state-change', { status: 'idle' });
  res.json({ message: 'Show status reset to idle' });
});

// API endpoint to end show
app.post('/api/end-show', (req, res) => {
  console.log('🎬 API: Ending show');
  if (activeShow.status === 'live') {
    activeShow.status = 'post-show';
    activeShow.endTime = new Date();
    io.emit('show-state-change', { status: 'post-show' });
    res.json({ message: 'Show ended successfully' });
  } else {
    res.json({ message: 'Show was not live' });
  }
});


// --- Socket.IO for WebRTC Signaling and Real-time Updates ---
io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);
  
  // If an artist is already live, immediately notify them about this new connection
  // This ensures WebRTC works even if audience doesn't select seats
  if (activeShow.status === 'live' && activeShow.artistId && socket.id !== activeShow.artistId) {
      console.log(`Auto-notifying artist ${activeShow.artistId} about new connection ${socket.id}`);
      io.to(activeShow.artistId).emit('new-audience-member', socket.id);
  }

  // WebRTC Signaling: Relays messages between peers
  socket.on('offer', (data) => {
    // Data: { sdp, targetSocketId } (offerer is socket.id)
    if (data.targetSocketId && io.sockets.sockets.has(data.targetSocketId)) {
        console.log(`[WebRTC] Relaying OFFER from ${socket.id} to ${data.targetSocketId}`);
        io.to(data.targetSocketId).emit('offer', { sdp: data.sdp, offererSocketId: socket.id });
    } else {
        console.warn(`[WebRTC] Offer target ${data.targetSocketId} not found or invalid.`);
    }
  });

  socket.on('answer', (data) => {
    // Data: { sdp, targetSocketId } (answerer is socket.id)
    if (data.targetSocketId && io.sockets.sockets.has(data.targetSocketId)) {
        console.log(`[WebRTC] Relaying ANSWER from ${socket.id} to ${data.targetSocketId}`);
        io.to(data.targetSocketId).emit('answer', { sdp: data.sdp, answererSocketId: socket.id });
    } else {
        console.warn(`[WebRTC] Answer target ${data.targetSocketId} not found or invalid.`);
    }
  });

  socket.on('ice-candidate', (data) => {
    // Data: { candidate, targetSocketId } (sender is socket.id)
    if (data.targetSocketId && io.sockets.sockets.has(data.targetSocketId)) {
        console.log(`[WebRTC] Relaying ICE candidate from ${socket.id} to ${data.targetSocketId}`);
        io.to(data.targetSocketId).emit('ice-candidate', { candidate: data.candidate, senderSocketId: socket.id });
    } else {
        console.warn(`[WebRTC] ICE candidate target ${data.targetSocketId} not found or invalid.`);
    }
  });

  // Audience seat management (in-memory)
  socket.on('select-seat', (data) => {
    const { seatId, userName, userImage } = data;
    if (activeShow.audienceSeats[seatId]) {
      socket.emit('seat-selected', { success: false, message: 'Seat already taken' });
      return;
    }
    if (Object.keys(activeShow.audienceSeats).length >= 9) { // Cap at 9 front-row seats
      socket.emit('seat-selected', { success: false, message: 'Front row is full!' });
      return;
    }

    // Assign seat and store profile in-memory
    activeShow.audienceSeats[seatId] = { name: userName, imageUrl: userImage, socketId: socket.id };
    userProfiles[socket.id] = { name: userName, imageUrl: userImage, selectedSeat: seatId };

    io.emit('seat-update', { seatId, user: { name: userName, imageUrl: userImage, socketId: socket.id } }); // Notify all clients of new occupant
    socket.emit('seat-selected', { success: true, seatId });
    console.log(`User ${userName} selected seat ${seatId}`);

    // If an artist is already live, immediately send them an offer to this new audience member
    if (activeShow.status === 'live' && activeShow.artistId) {
        // Signal the artist (activeShow.artistId) that a new audience member has joined
        io.to(activeShow.artistId).emit('new-audience-member', socket.id);
        console.log(`Signaling artist ${activeShow.artistId} about new audience ${socket.id}`);
    }
  });

  socket.on('leave-seat', () => {
    const userData = userProfiles[socket.id];
    if (userData && userData.selectedSeat) {
      delete activeShow.audienceSeats[userData.selectedSeat];
      io.emit('seat-update', { seatId: userData.selectedSeat, user: null }); // Null user means seat is empty
      delete userData.selectedSeat;
      console.log(`User ${userData.name} left seat ${userData.selectedSeat}`);
    }
  });

  // Artist controls
  // Artist will call socket.emit('artist-go-live') from frontend to initiate stream setup
  // and handle WebRTC peer connection creation for each audience member.
  // The backend primarily orchestrates the signaling and broadcast of status.
  socket.on('artist-go-live', () => {
    console.log(`🎭 Artist ${socket.id} attempting to go live. Current show status: ${activeShow.status}`);
    
    // Auto-reset show if it's not in idle state
    if (activeShow.status !== 'idle' && activeShow.status !== 'pre-show') {
      console.log('🔧 Auto-resetting show state to idle for new artist');
      activeShow = {
        artistId: null,
        startTime: null,
        status: 'idle',
        audienceSeats: {},
        countdown: { isActive: false, timeRemaining: 0, totalTime: 0 }
      };
      io.emit('show-state-change', { status: 'idle' });
    }
    
    // Now proceed with going live
    activeShow.status = 'live';
    activeShow.artistId = socket.id; // The socket that sent 'artist-go-live' is the artist
    activeShow.startTime = Date.now();
    io.emit('show-status-update', { status: 'live', artistId: socket.id });
    console.log(`[LIVE] Artist ${socket.id} is now LIVE! Broadcasting to ${io.engine.clientsCount} connected clients.`);

    // Notify the ARTIST about all currently seated audience members
    Object.values(activeShow.audienceSeats).forEach(audience => {
        io.to(socket.id).emit('new-audience-member', audience.socketId);
        console.log(`[WEBRTC] Notifying artist about seated audience: ${audience.socketId}`);
    });
    
    // Also notify about any other connected clients (for non-seated audience members)
    let connectedAudience = 0;
    io.sockets.sockets.forEach((clientSocket) => {
        if (clientSocket.id !== socket.id) { // Don't send to artist themselves
            io.to(socket.id).emit('new-audience-member', clientSocket.id);
            connectedAudience++;
            console.log(`[WEBRTC] Notifying artist about connected audience: ${clientSocket.id}`);
        }
    });
    
    console.log(`[LIVE] Setup complete. ${connectedAudience} audience members will receive offers.`);
  });

  socket.on('artist-end-show', () => {
    if (activeShow.status !== 'live') {
      console.warn('Artist tried to end show when no show is live.');
      return;
    }
    activeShow.status = 'post-show';
    io.emit('show-status-update', { status: 'post-show' });
    console.log(`Artist ${socket.id} has ended the show.`);
    activeShow.artistId = null; // Clear artist
    activeShow.startTime = null;

    // Reset after a short delay for post-show message display
    setTimeout(() => {
        // Clear audience seats
        for (const seatId in activeShow.audienceSeats) {
            delete activeShow.audienceSeats[seatId];
        }
        // Clear user profiles
        for (const socketId in userProfiles) {
            delete userProfiles[socketId];
        }
        io.emit('all-seats-empty');
        activeShow.status = 'idle';
        activeShow.countdown = { isActive: false, timeRemaining: 0, totalTime: 0 };
        console.log('Show cycle reset to idle after post-show.');
    }, 5000); // 5 seconds post-show display
  });

  // Reset show state (called when artist connects)
  socket.on('reset-show', () => {
    console.log(`🎭 Artist ${socket.id} requesting show reset`);
    
    // Clear any existing countdown interval
    if (activeShow.countdown.interval) {
      clearInterval(activeShow.countdown.interval);
    }
    
    activeShow = {
      artistId: null,
      startTime: null,
      status: 'idle',
      audienceSeats: {},
      countdown: { isActive: false, timeRemaining: 0, totalTime: 0, interval: null }
    };
    io.emit('show-state-change', { status: 'idle' });
    console.log('Show state reset to idle');
  });

  // Countdown management
  socket.on('start-countdown', (data) => {
    const { minutes, seconds } = data;
    
    console.log(`🎬 Artist ${socket.id} requesting countdown start:`, data);
    
    // Set this socket as the artist if not already set
    if (!activeShow.artistId) {
      activeShow.artistId = socket.id;
      console.log(`🎭 Artist ${socket.id} set as active artist`);
    }
    
    // Only allow the current artist to start countdown
    if (activeShow.artistId !== socket.id) {
      console.warn('Non-artist tried to start countdown');
      return;
    }
    
    // Use seconds if provided, otherwise convert minutes to seconds
    const totalSeconds = seconds || (minutes * 60);
    activeShow.countdown = {
      isActive: true,
      timeRemaining: totalSeconds,
      totalTime: totalSeconds
    };
    activeShow.status = 'pre-show';
    
    const minutesDisplay = Math.floor(totalSeconds / 60);
    const secondsDisplay = totalSeconds % 60;
    console.log(`🎬 Countdown started: ${minutesDisplay}:${secondsDisplay.toString().padStart(2, '0')} (${totalSeconds}s) by artist ${socket.id}`);
    io.emit('countdown-started', { 
      timeRemaining: totalSeconds, 
      totalTime: totalSeconds,
      artistId: socket.id 
    });
    
    // Clear any existing countdown interval
    if (activeShow.countdown.interval) {
      clearInterval(activeShow.countdown.interval);
    }
    
    // Start countdown timer
    activeShow.countdown.interval = setInterval(() => {
      activeShow.countdown.timeRemaining--;
      
      if (activeShow.countdown.timeRemaining <= 0) {
        // Countdown finished - start the show
        clearInterval(activeShow.countdown.interval);
        activeShow.countdown.interval = null;
        activeShow.countdown.isActive = false;
        activeShow.status = 'live';
        activeShow.startTime = Date.now();
        
        console.log('🎭 Countdown finished - show is now LIVE!');
        io.emit('countdown-finished', { artistId: socket.id });
        io.emit('show-status-update', { status: 'live', artistId: socket.id });
        
        // Notify artist about audience members for WebRTC
        Object.values(activeShow.audienceSeats).forEach(audience => {
          io.to(socket.id).emit('new-audience-member', audience.socketId);
        });
      } else {
        // Update countdown for all clients
        io.emit('countdown-update', { 
          timeRemaining: activeShow.countdown.timeRemaining,
          artistId: socket.id 
        });
      }
    }, 1000);
  });

  socket.on('stop-countdown', () => {
    if (activeShow.artistId !== socket.id) {
      console.warn('Non-artist tried to stop countdown');
      return;
    }
    
    // Clear countdown interval
    if (activeShow.countdown.interval) {
      clearInterval(activeShow.countdown.interval);
    }
    
    activeShow.countdown = { isActive: false, timeRemaining: 0, totalTime: 0, interval: null };
    activeShow.status = 'idle';
    
    console.log('⏹️ Countdown stopped');
    io.emit('countdown-stopped', { artistId: socket.id });
    io.emit('show-status-update', { status: 'idle' });
  });


  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
    // Remove user's seat on disconnect
    const userData = userProfiles[socket.id];
    if (userData && userData.selectedSeat) {
      delete activeShow.audienceSeats[userData.selectedSeat];
      io.emit('seat-update', { seatId: userData.selectedSeat, user: null });
    }
    delete userProfiles[socket.id]; // Remove profile from in-memory store
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
