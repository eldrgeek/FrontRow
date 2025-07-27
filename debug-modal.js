const io = require('socket.io-client');

console.log('🔍 Debugging FrontRow Modal...');

// Connect to the server
const socket = io('http://localhost:3001', {
    reconnection: false,
    timeout: 5000
});

socket.on('connect', () => {
    console.log('✅ Connected to server');
    console.log('📡 Socket ID:', socket.id);
    
    // Send a simple test message
    console.log('📢 Sending test message...');
    socket.emit('modal-notification', {
        action: 'show',
        message: '🔍 Debug test - Modal should be visible!',
        duration: 5000,
        priority: 'info',
        icon: 'info'
    });
    
    // Check if any other clients are connected
    setTimeout(() => {
        console.log('🔍 Checking for other connected clients...');
        socket.emit('get-connected-clients', {}, (response) => {
            console.log('📊 Connected clients:', response);
        });
    }, 1000);
    
    // Exit after 3 seconds
    setTimeout(() => {
        console.log('👋 Debug complete');
        socket.disconnect();
        process.exit(0);
    }, 3000);
});

socket.on('disconnect', () => {
    console.log('❌ Disconnected from server');
});

socket.on('connect_error', (error) => {
    console.log('❌ Connection error:', error.message);
    process.exit(1);
});

// Listen for any broadcast messages
socket.onAny((eventName, ...args) => {
    console.log(`📡 Received event: ${eventName}`, args);
}); 