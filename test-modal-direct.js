const io = require('socket.io-client');

// Connect to the server
const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('✅ Connected to server');
  
  // Send a test message
  socket.emit('modal-notification', {
    action: 'show',
    message: '🖥️ Switching to Chrome on Desktop #2',
    duration: 3000,
    priority: 'info',
    icon: 'desktop'
  });
  
  console.log('📢 Sent test message to modal');
  
  // Send another message after 2 seconds
  setTimeout(() => {
    socket.emit('modal-notification', {
      action: 'show',
      message: '📑 Focusing on first tab',
      duration: 2000,
      priority: 'info',
      icon: 'tab'
    });
    console.log('📢 Sent second message');
  }, 2000);
  
  // Send a success message
  setTimeout(() => {
    socket.emit('modal-notification', {
      action: 'show',
      message: '✅ Successfully switched to Chrome!',
      duration: 3000,
      priority: 'success',
      icon: 'check'
    });
    console.log('📢 Sent success message');
  }, 5000);
  
  // Exit after 8 seconds
  setTimeout(() => {
    console.log('👋 Test complete');
    process.exit(0);
  }, 8000);
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
});

socket.on('connect_error', (error) => {
  console.log('❌ Connection error:', error.message);
}); 