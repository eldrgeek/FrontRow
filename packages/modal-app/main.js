const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Store window reference
let mainWindow;

// Config file path for persistence
const configPath = path.join(app.getPath('userData'), 'modal-config.json');

// Default config
const defaultConfig = {
  x: 50,
  y: 50,
  width: 400,
  height: 200,
  alwaysOnTop: true
};

// Load config
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return defaultConfig;
}

// Save config
function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

function createWindow() {
  const config = loadConfig();
  
  // Ensure minimum size
  const width = Math.max(config.width || 400, 300);
  const height = Math.max(config.height || 200, 150);
  
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    x: config.x || 50,
    y: config.y || 50,
    frame: false, // Remove window frame
    resizable: true,
    alwaysOnTop: config.alwaysOnTop,
    transparent: true, // Enable transparency for better appearance
    visibleOnAllWorkspaces: true, // Show on all desktops/workspaces (macOS)
    type: 'panel', // Use panel type for better cross-desktop behavior
    movable: true, // Allow window to be moved
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false, // Don't show until ready
    skipTaskbar: true, // Don't show in taskbar
    focusable: false // Don't take focus
  });

  // Load the renderer
  const isDev = process.argv.includes('--dev');
  if (isDev) {
    // Wait for Vite dev server to be ready, then load
    const waitForVite = async () => {
      try {
        console.log('🔄 Waiting for Vite dev server at http://localhost:5174...');
        await mainWindow.loadURL('http://localhost:5174');
        console.log('✅ Vite dev server loaded successfully');
        console.log('🔄 Showing window...');
        mainWindow.show();
        console.log('✅ Window should now be visible');
        
        // Force window to front and ensure it's visible on all workspaces
        mainWindow.setAlwaysOnTop(true);
        mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      } catch (error) {
        console.error('❌ Failed to load Vite dev server:', error.message);
        console.log('🔄 Retrying in 2 seconds...');
        setTimeout(waitForVite, 2000);
      }
    };
    waitForVite();
  } else {
    // Load from built files in production
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });
  }

  // Save window position and size when moved/resized
  mainWindow.on('moved', () => {
    const [x, y] = mainWindow.getPosition();
    const [width, height] = mainWindow.getSize();
    const newConfig = { ...config, x, y, width, height };
    saveConfig(newConfig);
  });

  mainWindow.on('resized', () => {
    const [x, y] = mainWindow.getPosition();
    const [width, height] = mainWindow.getSize();
    const newConfig = { ...config, x, y, width, height };
    saveConfig(newConfig);
  });

  // Handle window close - allow closing in dev mode, hide in production
  mainWindow.on('close', (event) => {
    if (isDev) {
      // Allow closing in development mode
      app.quit();
    } else {
      // Hide instead of close in production
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Prevent window from taking focus
  mainWindow.on('focus', () => {
    mainWindow.blur();
  });

  // Prevent DevTools from opening on window focus
  mainWindow.on('show', () => {
    mainWindow.blur();
  });

  // Development mode setup
  if (isDev) {
    // Only open DevTools if explicitly requested
    if (process.argv.includes('--debug')) {
      mainWindow.webContents.openDevTools();
    }
    
    // Hot reload disabled to prevent process spawning issues
    // Changes require manual restart: Ctrl+C and restart the app
  }
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Another instance is already running, quitting...');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for renderer communication
ipcMain.handle('get-config', () => {
  return loadConfig();
});

ipcMain.handle('save-config', (event, config) => {
  saveConfig(config);
  return true;
});



 
