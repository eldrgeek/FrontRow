# FrontRow Modal System Complete Reference

## System Architecture

### Components
1. **MCP Server** (`mcp_modal_server.py`) - FastMCP server providing tools for Cursor/Claude
2. **Backend Server** (`server/index.js`) - Express server handling HTTP/WebSocket connections
3. **Modal Electron App** (`packages/modal-app`) - Desktop app showing modal dialogs
4. **Frontend React App** (`packages/modal-app/src/App.tsx`) - Modal UI and interaction logic

### Server Deployment
There is **ONE backend server** for FrontRow that serves both the main application and modal test endpoints:
- **Local Development**: `http://localhost:3001` (test endpoints enabled by default)
- **Production**: `https://frontrow-production.onrender.com` (master branch, test endpoints disabled)
- **Staging**: `https://frontrow-staging.onrender.com` (develop branch)

The server is automatically deployed to Render when pushed to GitHub:
- Push to `master` → Deploys to production
- Push to `develop` → Deploys to staging
- Configuration in `render.yaml`

## Data Flow
```
MCP Tool Call → HTTP Request → Backend Server → WebSocket → Modal App
                                     ↓
                              Store Response
                                     ↓
MCP Wait Tool ← HTTP Poll ← Backend Server ← WebSocket ← User Click
```

## Complete API Reference

### 1. Basic Message Display

#### Show Message
```python
# Via MCP Server
modal_show_message(
    message="Switching to Desktop 2",
    duration=3000,      # milliseconds
    priority="info",    # info|success|warning|error
    icon="desktop"      # optional icon name
)

# Direct HTTP Request
POST http://localhost:3001/api/test/modal
{
    "action": "show",
    "message": "Your message here",
    "duration": 3000,
    "priority": "info",
    "icon": "desktop"
}
```

#### Hide Modal
```python
# Via MCP Server
modal_hide()

# Direct HTTP Request
POST http://localhost:3001/api/test/modal
{
    "action": "hide"
}
```

### 2. Progress Bar

```python
# Via MCP Server
modal_progress(
    progress=75,  # 0-100
    message="Processing files..."
)

# Direct HTTP Request
POST http://localhost:3001/api/test/modal
{
    "action": "progress",
    "progress": 75,
    "message": "Processing files..."
}
```

### 3. Interactive Dialogs (Success/Failed/Stop)

#### Send Interactive Step
```python
# Via MCP Server
modal_send_interactive_step(
    message="Ready to switch desktops?",
    test_step="Desktop Switch",
    test_id="switch_001",
    priority="info",
    icon="desktop"
)

# Direct HTTP Request
POST http://localhost:3001/api/test/modal
{
    "action": "interactive",
    "message": "Ready to switch desktops?",
    "interactive": true,
    "testStep": "Desktop Switch",
    "testId": "switch_001",
    "priority": "info",
    "icon": "desktop"
}
```

#### Wait for Response
```python
# Via MCP Server
response = modal_wait_for_response(
    test_id="switch_001",
    timeout=60  # seconds
)
# Returns: {"success": true, "response": "success"|"failure"|"stop"}

# Direct HTTP Request (polling)
GET http://localhost:3001/api/test/response/switch_001
# Returns: {"response": "success"|"failure"|"stop", "step": "Desktop Switch", "timestamp": 123456789}
```

### 4. Question Input (Text Response)

#### Ask Question
```python
# Via MCP Server  
modal_ask_question(
    question="What is your name?",
    options=["Alice", "Bob"]  # Currently not used in UI
)

# Direct HTTP Request
POST http://localhost:3001/api/test/modal
{
    "action": "question",
    "question": "What is your name?",
    "questionId": "q_001"
}
```

#### Get Question Response
```python
# Direct HTTP Request (polling)
GET http://localhost:3001/api/question/response/q_001
# Returns: {"response": "User's text input", "timestamp": "2025-07-29T..."}
```

### 5. Connection Management

```python
# Via MCP Server
modal_connect(server_url="http://localhost:3001")
modal_status()
modal_version()
```

## Available Icons
```
browser   → 🌐    keyboard → ⌨️     camera   → 📷
check     → ✅    error    → ❌     warning  → ⚠️
info      → ℹ️     success  → ✅     loading  → 🔄
desktop   → 🖥️    tab      → 📑     click    → 👆
type      → ✍️     wait     → ⏳
```

## Modal App Features

### Visual Features
- **Draggable**: Drag handle at top with indicator (⋮⋮)
- **Status Indicator**: Connection status dot (green=connected, yellow=connecting, red=disconnected)
- **Close Button**: × button to hide modal
- **Auto-fade**: Fades to 10% opacity after 5 seconds of inactivity
- **All Desktops**: Shows on all macOS workspaces/desktops
- **Transparent Background**: Blends with desktop

### Interactive Features
- **Test Response Buttons**: Success ✅ / Failed ❌ / Stop 🛑
- **Question Input**: Text field with Send button
- **Progress Bar**: Visual progress with percentage
- **Auto-hide**: Messages disappear after duration (except interactive)

## Python Direct Usage Examples

### Simple Script
```python
import requests
import time

# Send a message
response = requests.post("http://localhost:3001/api/test/modal", json={
    "message": "Hello from Python!",
    "duration": 3000,
    "priority": "info",
    "icon": "info"
})

# Show progress
for i in range(0, 101, 10):
    requests.post("http://localhost:3001/api/test/modal", json={
        "action": "progress",
        "progress": i,
        "message": f"Processing... {i}%"
    })
    time.sleep(0.5)
```

### Interactive Dialog Script
```python
import requests
import time
import uuid

test_id = f"test_{uuid.uuid4().hex[:8]}"

# Send interactive step
requests.post("http://localhost:3001/api/test/modal", json={
    "action": "interactive",
    "message": "Ready to proceed?",
    "interactive": True,
    "testStep": "Confirmation",
    "testId": test_id
})

# Poll for response
while True:
    resp = requests.get(f"http://localhost:3001/api/test/response/{test_id}")
    data = resp.json()
    if data.get("response"):
        print(f"User clicked: {data['response']}")
        break
    time.sleep(1)
```

### Question Dialog Script
```python
import requests
import time
import uuid

question_id = f"q_{uuid.uuid4().hex[:8]}"

# Ask question
requests.post("http://localhost:3001/api/test/modal", json={
    "action": "question",
    "question": "What is your name?",
    "questionId": question_id
})

# Poll for response
while True:
    resp = requests.get(f"http://localhost:3001/api/question/response/{question_id}")
    data = resp.json()
    if data.get("response"):
        print(f"User answered: {data['response']}")
        break
    time.sleep(1)
```

## Backend Server Endpoints

### Modal Control
- `POST /api/test/modal` - Send modal commands
- `GET /api/test/response/:testId` - Get interactive dialog response
- `DELETE /api/test/response/:testId` - Clear test response
- `GET /api/question/response/:questionId` - Get question response
- `GET /api/question/responses` - Get all question responses (debug)

### Debug/Health
- `GET /health` - Server health check
- `GET /api/debug/state` - Complete server state
- `GET /api/test/events` - Test event history

## WebSocket Events

### Client → Server
- `test-response` - User clicked button on interactive dialog
- `question-response` - User submitted text response

### Server → Client  
- `modal-update` - Update modal display
- `connect/disconnect/reconnect` - Connection status

## Troubleshooting

### Modal Not Visible
1. Check Electron app is running: `npm start` in `packages/modal-app`
2. Check connection status indicator (should be green)
3. Verify server is running on port 3001
4. Check if modal was closed (× button) - send new message to show

### Responses Not Working
1. Ensure `testId` or `questionId` is unique
2. Check server logs for response storage
3. Verify WebSocket connection is active
4. Poll within timeout period (responses are deleted after reading)

### Connection Issues
1. Server must be running: `npm start` in `server/`
2. Modal app must be running: `npm start` in `packages/modal-app`
3. Check firewall isn't blocking localhost:3001
4. Verify no other service is using port 3001

## Development Tips

1. **Test Script**: Use `packages/modal-app/test-modal.py` for testing
2. **Debug Mode**: Run modal app with `npm start -- --dev --debug` for DevTools
3. **Server Logs**: Check server console for WebSocket events
4. **MCP Logs**: Check `~/mcp_modal_server.log` for MCP server issues

## Cross-Desktop Coordination Protocol

When performing operations across different desktops, clear communication through the modal is essential since the user cannot see what's happening on other desktops.

### Step-by-Step Protocol

1. **Before Action - Ask Permission**
   - Use `modal_send_interactive_step` with clear description
   - Present "Success/Failed/Stop" buttons
   - Wait for user response with `modal_wait_for_response`

2. **During Action - Status Updates**
   - Send modal message: "Performing: [specific action]..."
   - Include details about what's happening
   - Keep messages visible (duration: 5000ms minimum)

3. **After Action - Report Results**
   - Send result message: "✓ Completed: [what was done]" or "✗ Failed: [error]"
   - Include next steps if applicable
   - Wait for acknowledgment if needed

### Key Principles
1. **Always Ask Before Acting** - Never assume permission
2. **Report What You're Doing** - User can't see the other desktop
3. **Confirm Results** - Both success and failure
4. **Be Specific** - Say exactly what keys/clicks you're using
5. **Wait for User Response** - Don't timeout too quickly (30s minimum)

### Error Handling
If something fails:
1. Report the specific failure
2. Ask if you should retry or try alternative approach
3. Wait for user guidance

## Security Notes

- Modal only accepts connections from localhost
- Test endpoints are automatically disabled in production (NODE_ENV=production)
- Test endpoints can be enabled in production with `ENABLE_TEST_ENDPOINTS=true`
- No authentication required (local development tool)
- Responses are deleted after reading (one-time use)

## Production Deployment

### Test Endpoints in Production
By default, test endpoints (`/api/test/*`) are **disabled** in production for security. They return 404 with error: "Test endpoints not available in this environment".

To enable test endpoints in production (use with caution):
1. Add environment variable in Render: `ENABLE_TEST_ENDPOINTS=true`
2. Also add `ENABLE_TEST_LOGGING=true` for test event logging
3. Restart the service

### Important URLs
- **Production Backend**: `https://frontrow-production.onrender.com`
- **Health Check**: `https://frontrow-production.onrender.com/health`
- **Test Modal** (if enabled): `POST https://frontrow-production.onrender.com/api/test/modal`

### Local vs Production Usage
When using the modal system:
- **Local Development**: Point to `http://localhost:3001` (test endpoints enabled)
- **Production Testing**: Must enable test endpoints via environment variables
- **Modal App**: Always connects to `http://localhost:3001` (local server)