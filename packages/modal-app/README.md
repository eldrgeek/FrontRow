# FrontRow Test Modal App

A cross-platform Electron application that displays test notifications during FrontRow E2E testing. The modal appears on top of all desktops and provides real-time feedback about test automation activities.

## Features

- **Always-on-top**: Stays visible during testing across all desktops
- **Enhanced Dragging**: Full title bar dragging support (fixed in v2.1.0)
- **Auto-fade System**: Fades to invisibility after 5 seconds of no interaction
- **Smart Close Button**: X button hides modal but allows new messages to reopen
- **Resizable**: Adjust size as needed
- **Persistent**: Remembers position and size between sessions
- **Real-time**: WebSocket connection to FrontRow server
- **Rich UI**: Icons, progress bars, and priority-based styling
- **Interactive Controls**: Success/Failed/Stop buttons for test coordination

## Installation

```bash
cd packages/modal-app
npm install
```

## Development

```bash
# Start in development mode
npm run dev

# Start with dev tools
npm run dev -- --dev
```

## Building

```bash
# Build for current platform
npm run build

# Create distributable
npm run dist
```

## Usage

### Starting the Modal

1. Start the FrontRow server: `npm start` (in server directory)
2. Start the modal app: `npm start` (in packages/modal-app)
3. The modal will connect to the server and show "Connected to FrontRow server"

### Sending Messages

Messages can be sent via:

1. **WebSocket**: Direct socket.io connection
2. **HTTP API**: POST to `/api/test/modal`
3. **Test Coordinator**: Using the Python test coordinator

### Message Format

```json
{
  "action": "show|hide|update|progress",
  "message": "Your message here",
  "duration": 3000,
  "priority": "info|warning|error|success",
  "icon": "browser|keyboard|camera|check|error|desktop|tab|click|type|wait",
  "progress": 50
}
```

### Available Icons

- `browser` - 🌐 Browser operations
- `keyboard` - ⌨️ Keyboard input
- `camera` - 📷 Camera operations
- `check` - ✅ Success/completion
- `error` - ❌ Errors
- `warning` - ⚠️ Warnings
- `info` - ℹ️ General info
- `success` - ✅ Success
- `loading` - 🔄 Loading states
- `desktop` - 🖥️ Desktop switching
- `tab` - 📑 Tab operations
- `click` - 👆 Mouse clicks
- `type` - ✍️ Text input
- `wait` - ⏳ Waiting states

### Priority Levels

- `info` - Blue border, general information
- `warning` - Orange border, warnings
- `error` - Red border, errors
- `success` - Green border, success messages

## Testing

Run the test script to see the modal in action:

```bash
python test-modal.py
```

This will send a series of test messages demonstrating various features.

## Configuration

The modal saves its configuration to:
- **macOS**: `~/Library/Application Support/frontrow-modal/modal-config.json`
- **Windows**: `%APPDATA%/frontrow-modal/modal-config.json`
- **Linux**: `~/.config/frontrow-modal/modal-config.json`

Configuration includes:
- Window position (x, y)
- Window size (width, height)
- Always-on-top setting

## Integration with Test Coordinator

The Python test coordinator can send messages:

```python
# Send a simple message
await coordinator.send_modal_message(
    "Switching to Chrome on Desktop #2",
    duration=2000,
    priority="info",
    icon="desktop"
)

# Send progress update
await coordinator.send_modal_progress(75, "Running test scenario...")
```

## Troubleshooting

### Modal won't connect
- Ensure FrontRow server is running on localhost:3001
- Check firewall settings
- Verify network connectivity

### Modal not visible
- Check if it's behind other windows
- Look for the modal in the top-left corner
- Try dragging it to a visible area

### Messages not appearing
- Check server logs for WebSocket errors
- Verify the modal is connected (green status indicator)
- Check browser console for JavaScript errors

## Development Notes

- The modal uses Socket.IO for real-time communication
- Position/size persistence is handled by Electron's main process
- The renderer process handles UI and WebSocket communication
- All IPC communication is secured with contextIsolation

## Recent Updates (v2.1.0)

### UI/UX Fixes
- **Fixed dragging issue**: Now works across entire title bar, not just top edge
- **Added auto-fade**: Modal fades to 0.1 opacity after 5 seconds of no interaction
- **Fixed close button**: X button hides modal instead of closing, allows reopening
- **Enhanced interaction**: Mouse movement, hover, and clicks reset fade timer

### Technical Improvements
- Dedicated `.drag-area` with proper `-webkit-app-region: drag`
- Smart state management with `isClosed` tracking
- Smooth opacity transitions (0.5s ease-in-out)
- Improved pointer event handling during fade states

## Future Enhancements

- [ ] Multiple message queue support
- [ ] Custom themes/styling
- [ ] Sound notifications
- [ ] Keyboard shortcuts
- [ ] Message history
- [ ] Export test logs 