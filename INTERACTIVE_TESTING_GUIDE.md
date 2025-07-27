# Interactive Testing System Guide

The FrontRow Interactive Testing System provides two modes for testing:

1. **🤖 Automated Mode**: Script/LLM runs step-by-step with modal notifications
2. **👤 Interactive Mode**: User manually confirms each step via the modal

## 🚀 Quick Start

### 1. Start the Server and Modal

```bash
# Terminal 1: Start FrontRow server
npm run dev

# Terminal 2: Start the modal app
cd packages/modal-app && npm run dev
```

### 2. Run Demo Scripts

```bash
# Demo both modes
python test_interactive_demo.py

# LLM/Playwright integration example
python test_llm_integration.py
```

## 📋 Testing Modes

### Automated Mode

Perfect for:
- ✅ Continuous integration tests
- ✅ Regression testing
- ✅ Performance testing
- ✅ Load testing

**Example:**
```python
from e2e_test_coordinator import FrontRowE2ETestCoordinator

coordinator = FrontRowE2ETestCoordinator()

# Send automated notification
await coordinator.send_modal_message(
    "Opening browser and navigating to FrontRow",
    duration=2000,
    priority="info",
    icon="robot"
)

# Send progress updates
await coordinator.send_modal_progress(50, "Selecting seat A1")
```

### Interactive Mode

Perfect for:
- ✅ Manual verification of critical steps
- ✅ User acceptance testing
- ✅ Exploratory testing
- ✅ Complex scenarios requiring human judgment

**Example:**
```python
# Send interactive step and wait for user response
response = await coordinator.send_interactive_step(
    message="Please confirm the page loaded correctly",
    test_step="page_verification",
    test_id="test_123",
    icon="browser"
)

# Handle user response
if response.get('response') == 'success':
    print("✅ User confirmed step completed")
elif response.get('response') == 'failure':
    print("❌ User reported step failed")
elif response.get('response') == 'stop':
    print("🛑 User stopped the test")
```

## 🎯 Modal Interface

The modal displays different interfaces based on the mode:

### Automated Mode
- Shows progress bar
- Displays step descriptions
- Auto-hides after duration
- No user interaction required

### Interactive Mode
- Shows test step information
- Displays three action buttons:
  - ✅ **Success**: Step completed successfully
  - ❌ **Failed**: Step failed or didn't work
  - 🛑 **Stop Test**: Stop the entire test sequence
- Waits for user input before proceeding

## 🔧 API Reference

### Server Endpoints

#### Send Modal Message
```http
POST /api/test/modal
Content-Type: application/json

{
  "message": "Step description",
  "duration": 3000,
  "priority": "info",
  "icon": "robot",
  "interactive": false,
  "testStep": "step_name",
  "testId": "unique_id"
}
```

#### Get Test Response
```http
GET /api/test/response/{testId}
```

#### Clear Test Response
```http
DELETE /api/test/response/{testId}
```

### Python Coordinator Methods

#### `send_modal_message(message, duration, priority, icon)`
Send automated notification to modal.

#### `send_modal_progress(progress, message)`
Send progress update with percentage.

#### `send_interactive_step(message, test_step, test_id, priority, icon)`
Send interactive step and wait for user response.

#### `wait_for_test_response(test_id, timeout)`
Wait for user response to interactive step.

#### `clear_test_response(test_id)`
Clear stored test response.

## 🎨 Available Icons

The modal supports various icons for different types of actions:

- `robot` - Automated actions
- `user` - User interactions
- `browser` - Browser operations
- `navigation` - Page navigation
- `seat` - Seat selection
- `camera` - Photo/video capture
- `show` - Show-related actions
- `check` - Success/completion
- `error` - Errors/failures
- `warning` - Warnings
- `info` - General information

## 🚦 Priority Levels

- `info` - General information (blue)
- `success` - Successful completion (green)
- `warning` - Warnings (yellow)
- `error` - Errors/failures (red)

## 🔄 WebSocket Events

### From Server to Modal
- `modal-update` - Update modal content and state

### From Modal to Server
- `test-response` - User response to interactive step

## 📝 Test Response Format

```json
{
  "response": "success|failure|stop|timeout",
  "step": "step_name",
  "timestamp": 1234567890
}
```

## 🛠️ Integration Examples

### Playwright Integration

```python
from playwright.async_api import async_playwright

async def run_playwright_test():
    coordinator = FrontRowE2ETestCoordinator()
    
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        
        # Automated: Navigate
        await coordinator.send_modal_message("Opening FrontRow", icon="browser")
        await page.goto("http://localhost:5173")
        
        # Interactive: Verify page loaded
        response = await coordinator.send_interactive_step(
            "Please confirm the page loaded correctly",
            "page_verification",
            "test_123"
        )
        
        if response.get('response') == 'success':
            # Continue with automated steps
            await page.click('[data-seat="A1"]')
        else:
            print("Test failed at page verification")
```

### LLM Integration

```python
async def llm_test_sequence():
    coordinator = FrontRowE2ETestCoordinator()
    
    # LLM decides which steps need human verification
    critical_steps = [
        "page_loaded_correctly",
        "seat_selection_visible", 
        "photo_capture_working"
    ]
    
    for step in critical_steps:
        # LLM generates instruction
        instruction = f"Please verify that {step.replace('_', ' ')}"
        
        response = await coordinator.send_interactive_step(
            instruction,
            step,
            f"llm_{step}"
        )
        
        if response.get('response') != 'success':
            # LLM can adapt or stop based on user feedback
            break
```

## 🔍 Troubleshooting

### Modal Not Appearing
1. Check if modal app is running: `cd packages/modal-app && npm run dev`
2. Verify server is running and test endpoints are enabled
3. Check browser console for WebSocket connection errors

### Interactive Steps Not Responding
1. Ensure modal is focused and visible
2. Check that `testId` is unique for each step
3. Verify WebSocket connection is active

### Test Responses Not Received
1. Check server logs for WebSocket events
2. Verify `global.testResponses` is being populated
3. Ensure proper timeout handling

## 🎯 Best Practices

1. **Use descriptive step names** - Help users understand what to verify
2. **Mix automated and interactive** - Automate routine steps, interact for verification
3. **Handle timeouts gracefully** - Set reasonable timeouts and provide fallbacks
4. **Unique test IDs** - Use UUIDs or timestamps to avoid conflicts
5. **Clear error messages** - Help users understand what went wrong
6. **Progress indicators** - Show progress for long automated sequences

## 🔮 Future Enhancements

- [ ] Screenshot capture and comparison
- [ ] Video recording of test sessions
- [ ] Test result analytics and reporting
- [ ] Integration with CI/CD pipelines
- [ ] Multi-user testing coordination
- [ ] Voice commands for hands-free testing 