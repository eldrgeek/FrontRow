// Modal App - FrontRow Test Notification System

class ModalApp {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.messageQueue = [];
        this.currentMessage = null;
        this.autoHideTimeout = null;
        
        // DOM elements
        this.container = document.getElementById('modal-container');
        this.messageEl = document.getElementById('message');
        this.iconEl = document.getElementById('icon');
        this.statusIndicator = document.getElementById('status-indicator');
        this.progressContainer = document.getElementById('progress-container');
        this.progressFill = document.getElementById('progress-fill');
        this.progressText = document.getElementById('progress-text');
        this.closeBtn = document.getElementById('close-btn');
        
        this.init();
    }
    
    async init() {
        // Load config
        this.config = await window.electronAPI.getConfig();
        
        // Setup drag functionality
        this.setupDrag();
        
        // Setup close button (development mode)
        this.setupCloseButton();
        
        // Connect to server
        this.connectToServer();
        
        // Show initial state
        this.updateStatus('connecting');
        this.showMessage('Connecting to FrontRow server...', 'info', '🔄');
    }
    
    setupDrag() {
        const dragHandle = document.getElementById('drag-handle');
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        
        dragHandle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = this.container.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            
            document.body.style.cursor = 'grabbing';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            this.container.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.cursor = 'default';
                
                // Reset transform and update position via Electron
                this.container.style.transform = '';
                
                // Position will be saved by Electron's moved event
            }
        });
    }
    
    setupCloseButton() {
        this.closeBtn.addEventListener('click', () => {
            this.container.style.display = 'none';
        });
        
        // Show close button in development mode
        if (window.location.search.includes('dev=true')) {
            this.closeBtn.classList.remove('hidden');
        }
    }
    
    connectToServer() {
        // Import socket.io-client dynamically
        const script = document.createElement('script');
        script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
        script.onload = () => {
            this.initializeSocket();
        };
        document.head.appendChild(script);
    }
    
    initializeSocket() {
        // Connect to FrontRow server with reconnection options
        this.socket = io('http://localhost:3001', {
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });
        
        this.socket.on('connect', () => {
            this.isConnected = true;
            this.updateStatus('connected');
            this.showMessage('Connected to FrontRow server', 'success', '✅');
            
            // Process any queued messages
            this.processMessageQueue();
        });
        
        this.socket.on('disconnect', (reason) => {
            this.isConnected = false;
            this.updateStatus('disconnected');
            
            if (reason === 'io server disconnect') {
                // Server disconnected us
                this.showMessage('Disconnected from server', 'error', '❌');
            } else {
                // Client disconnected or network issue
                this.showMessage('Connection lost - attempting to reconnect...', 'warning', '🔄');
            }
        });
        
        this.socket.on('reconnect', (attemptNumber) => {
            this.isConnected = true;
            this.updateStatus('connected');
            this.showMessage(`Reconnected to server (attempt ${attemptNumber})`, 'success', '✅');
        });
        
        this.socket.on('reconnect_attempt', (attemptNumber) => {
            this.updateStatus('connecting');
            this.showMessage(`Reconnecting... (attempt ${attemptNumber})`, 'warning', '🔄');
        });
        
        this.socket.on('reconnect_error', (error) => {
            this.updateStatus('disconnected');
            this.showMessage(`Reconnection failed: ${error.message}`, 'error', '❌');
        });
        
        this.socket.on('reconnect_failed', () => {
            this.updateStatus('disconnected');
            this.showMessage('Failed to reconnect after multiple attempts', 'error', '❌');
        });
        
        this.socket.on('modal-update', (data) => {
            this.handleModalUpdate(data);
        });
        
        this.socket.on('connect_error', (error) => {
            this.updateStatus('disconnected');
            this.showMessage(`Connection failed: ${error.message}`, 'error', '❌');
        });
    }
    
    handleModalUpdate(data) {
        const { action, message, duration = 3000, priority = 'info', icon } = this.getIconForAction(data);
        
        switch (action) {
            case 'show':
                this.showMessage(message, priority, icon, duration);
                break;
            case 'hide':
                this.hideMessage();
                break;
            case 'update':
                this.updateMessage(message, priority, icon);
                break;
            case 'progress':
                this.showProgress(data.progress || 0, message);
                break;
        }
    }
    
    getIconForAction(data) {
        const iconMap = {
            'browser': '🌐',
            'keyboard': '⌨️',
            'camera': '📷',
            'check': '✅',
            'error': '❌',
            'warning': '⚠️',
            'info': 'ℹ️',
            'success': '✅',
            'loading': '🔄',
            'desktop': '🖥️',
            'tab': '📑',
            'click': '👆',
            'type': '✍️',
            'wait': '⏳'
        };
        
        return {
            action: data.action,
            message: data.message,
            duration: data.duration,
            priority: data.priority || 'info',
            icon: data.icon ? iconMap[data.icon] || data.icon : iconMap[data.priority] || iconMap.info
        };
    }
    
    showMessage(message, priority = 'info', icon = 'ℹ️', duration = 3000) {
        // Clear any existing timeout
        if (this.autoHideTimeout) {
            clearTimeout(this.autoHideTimeout);
        }
        
        // Update UI
        this.messageEl.textContent = message;
        this.iconEl.textContent = icon;
        
        // Update priority styling
        this.container.className = `priority-${priority}`;
        
        // Show container with animation
        this.container.style.display = 'flex';
        this.container.classList.add('fade-in');
        
        // Hide progress bar
        this.progressContainer.classList.add('hidden');
        
        // Auto-hide after duration
        if (duration > 0) {
            this.autoHideTimeout = setTimeout(() => {
                this.hideMessage();
            }, duration);
        }
        
        this.currentMessage = { message, priority, icon, duration };
    }
    
    updateMessage(message, priority = 'info', icon = 'ℹ️') {
        this.messageEl.textContent = message;
        this.iconEl.textContent = icon;
        this.container.className = `priority-${priority}`;
        
        this.currentMessage = { message, priority, icon };
    }
    
    hideMessage() {
        this.container.classList.add('fade-out');
        
        setTimeout(() => {
            this.container.style.display = 'none';
            this.container.classList.remove('fade-out');
        }, 300);
        
        if (this.autoHideTimeout) {
            clearTimeout(this.autoHideTimeout);
            this.autoHideTimeout = null;
        }
    }
    
    showProgress(progress, message = '') {
        // Update message if provided
        if (message) {
            this.messageEl.textContent = message;
        }
        
        // Update progress bar
        this.progressFill.style.width = `${progress}%`;
        this.progressText.textContent = `${Math.round(progress)}%`;
        
        // Show progress container
        this.progressContainer.classList.remove('hidden');
        
        // Show container
        this.container.style.display = 'flex';
        this.container.classList.add('fade-in');
    }
    
    updateStatus(status) {
        this.statusIndicator.className = `status-indicator ${status}`;
    }
    
    processMessageQueue() {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.showMessage(message.message, message.priority, message.icon, message.duration);
        }
    }
    
    // Public API for direct calls
    sendMessage(message, priority = 'info', icon = 'ℹ️', duration = 3000) {
        if (this.isConnected) {
            this.showMessage(message, priority, icon, duration);
        } else {
            this.messageQueue.push({ message, priority, icon, duration });
        }
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.modalApp = new ModalApp();
});

// Export for external access
window.ModalApp = ModalApp; 