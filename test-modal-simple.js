const io = require('socket.io-client');

console.log('🚀 Testing FrontRow Modal...');

// Connect to the server
const socket = io('http://localhost:3001', {
    reconnection: false, // Don't reconnect for this test
    timeout: 5000
});

socket.on('connect', () => {
    console.log('✅ Connected to server');
    
    // Test message 1
    console.log('📢 Sending: Switching to Chrome on Desktop #2');
    socket.emit('modal-notification', {
        action: 'show',
        message: '🖥️ Switching to Chrome on Desktop #2',
        duration: 3000,
        priority: 'info',
        icon: 'desktop'
    });
    
    // Test message 2
    setTimeout(() => {
        console.log('📢 Sending: Focusing on first tab');
        socket.emit('modal-notification', {
            action: 'show',
            message: '📑 Focusing on first tab',
            duration: 2000,
            priority: 'info',
            icon: 'tab'
        });
    }, 2000);
    
    // Test message 3
    setTimeout(() => {
        console.log('📢 Sending: Entering user name');
        socket.emit('modal-notification', {
            action: 'show',
            message: '✍️ Entering user name: Alice',
            duration: 2500,
            priority: 'info',
            icon: 'type'
        });
    }, 4000);
    
    // Test message 4
    setTimeout(() => {
        console.log('📢 Sending: Taking profile picture');
        socket.emit('modal-notification', {
            action: 'show',
            message: '📷 Taking profile picture...',
            duration: 3000,
            priority: 'info',
            icon: 'camera'
        });
    }, 6500);
    
    // Test message 5
    setTimeout(() => {
        console.log('📢 Sending: Success message');
        socket.emit('modal-notification', {
            action: 'show',
            message: '✅ Profile picture captured successfully!',
            duration: 3000,
            priority: 'success',
            icon: 'check'
        });
    }, 9500);
    
    // Exit after all messages
    setTimeout(() => {
        console.log('👋 Test complete - check the modal for messages!');
        socket.disconnect();
        process.exit(0);
    }, 12500);
});

socket.on('disconnect', () => {
    console.log('❌ Disconnected from server');
});

socket.on('connect_error', (error) => {
    console.log('❌ Connection error:', error.message);
    process.exit(1);
}); 