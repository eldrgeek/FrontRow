
const backendConfig = {
  // Public STUN servers for WebRTC NAT traversal.
  // These are crucial for direct peer-to-peer connections to work.
  stunServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    // You might add more, or your own TURN server for truly robust connections
    // in complex network environments (e.g., behind strict firewalls),
    // but STUN is sufficient for many basic P2P setups.
  ],
};

module.exports = backendConfig;
