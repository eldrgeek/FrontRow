
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
const activeShow = {
  artistId: null,
  startTime: null,
  status: 'idle', // 'idle', 'pre-show', 'live', 'post-show'
  audienceSeats: {}, // { seatId: { name, imageUrl (base64 string), socketId } }
};
const userProfiles = {}; // { socketId: { name, imageUrl (base64 string), selectedSeat } } // Temporary store for connected users

// --- API Routes ---

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    activeConnections: io.engine.clientsCount || 0
  });
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


// --- Socket.IO for WebRTC Signaling and Real-time Updates ---
io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

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
    if (activeShow.status !== 'idle' && activeShow.status !== 'pre-show') {
      console.warn('Artist tried to go live when show is not idle/pre-show.');
      return;
    }
    activeShow.status = 'live';
    activeShow.artistId = socket.id; // The socket that sent 'artist-go-live' is the artist
    activeShow.startTime = Date.now();
    io.emit('show-status-update', { status: 'live', artistId: socket.id });
    console.log(`Artist ${socket.id} is now LIVE!`);

    // Notify the ARTIST about all currently seated audience members
    // Artist's frontend will generate offers to these audience members
    Object.values(activeShow.audienceSeats).forEach(audience => {
        io.to(socket.id).emit('new-audience-member', audience.socketId);
        console.log(`Notifying artist ${socket.id} about seated audience member ${audience.socketId}.`);
    });
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
        console.log('Show cycle reset to idle after post-show.');
    }, 5000); // 5 seconds post-show display
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
