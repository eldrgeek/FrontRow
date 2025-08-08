# FrontRow Unified Testing System

## Vision & Intent

The FrontRow Testing System is a comprehensive, multi-modal testing framework that bridges the gap between automated testing and human verification. It enables AI assistants, developers, and test scripts to coordinate complex end-to-end testing scenarios with real-time visual feedback and interactive decision points.

### Core Philosophy
- **Visual Coordination**: All test actions are visible through a persistent modal dialog that appears across all desktop workspaces
- **Interactive Verification**: Critical test points require human confirmation, ensuring quality and catching edge cases
- **AI-Friendly Interface**: MCP (Model Context Protocol) integration allows AI assistants to orchestrate complex testing workflows
- **Developer Experience**: Simple Python/JavaScript APIs with clear patterns for both automated and interactive testing

## System Architecture

```
┌─────────────────────┐       MCP Protocol        ┌──────────────────┐
│   AI Assistant      │ ◄──────────────────────► │   MCP Server     │
│   (Claude/Cursor)   │                          │   (Python)       │
└─────────────────────┘                          └──────────────────┘
                                                          │
┌─────────────────────┐       Direct API                 │ HTTP/Socket.IO
│   Test Scripts      │ ─────────────────┐               │
│   (Python/JS)       │                  │               ▼
└─────────────────────┘                  │      ┌──────────────────┐
                                         └────► │  Backend Server  │
┌─────────────────────┐                         │  (Node.js)       │
│   Developer         │                         └──────────────────┘
│   (Manual Testing)  │                                  │
└─────────────────────┘                                  │ WebSocket
                                                         ▼
                                                ┌──────────────────┐
                                                │   Modal Dialog   │
                                                │   (Electron)     │
                                                │                  │
                                                │  ┌────────────┐  │
                                                │  │ ✅ ❌ 🛑  │  │
                                                │  └────────────┘  │
                                                └──────────────────┘
```

## Components

### 1. Modal Dialog Application (`packages/modal-app/`)
An Electron-based desktop application that provides visual feedback for testing:

**Features:**
- **Always-on-top**: Visible across all desktop workspaces
- **Interactive Controls**: Success/Failed/Stop buttons for test verification
- **Progress Tracking**: Visual progress bars for long-running operations
- **Text Input**: Question prompts for gathering user feedback
- **Drag Positioning**: Users can move the modal to convenient locations
- **Real-time Updates**: Socket.IO connection for instant message delivery

**Technology Stack:**
- Electron + React + TypeScript
- Vite build system
- Socket.IO client
- Material-style UI components

### 2. Backend Coordination Server (`server/index.js`)
Central hub for test coordination and message routing:

**Endpoints:**
- `POST /api/test/modal` - Send messages to modal dialog
- `GET /api/test/response/{testId}` - Poll for user responses
- `GET /health` - Service health check
- WebSocket events for real-time communication

**Features:**
- Response storage for interactive steps
- WebSocket broadcasting to connected clients
- RESTful API for test script integration
- CORS support for cross-origin requests

### 3. MCP Server (`mcp_modal_server.py`)
AI-friendly interface using Model Context Protocol:

**Transport Modes:**
- **STDIO Mode**: For direct integration with AI tools like Claude Desktop
- **HTTP Mode**: For network-based integration and testing

**Features:**
- Full modal control through standardized MCP tools
- Async operation with proper error handling
- Auto-restart on code changes (development mode)
- Comprehensive logging and debugging

### 4. Development Environment Manager (`start_dev.py`)
Unified launcher for the complete testing environment:

**Modes:**
- **Full Mode**: All services including MCP server
- **Basic Mode**: Core services without MCP
- **MCP-Only Mode**: Just the MCP server for focused development

**Features:**
- Cross-platform compatibility (Windows/macOS/Linux)
- Automatic dependency checking and installation
- Graceful process management with proper shutdown
- Color-coded output for easy monitoring
- Auto-restart capability for MCP server development

## Testing Modes

### 1. Exploratory Testing
Collaborative discovery between LLM and user to understand application behavior:

**Characteristics:**
- LLM and user work together to discover application functionality
- User provides high-level intent, LLM translates to MCP actions
- Continuous feedback loop through modal dialog
- Learning mode where both parties build understanding

**Example Flow:**
```python
# LLM communicates plan through modal
modal_show_message("🔍 I'll try to navigate to the login page", 3000, "info")
modal_send_interactive_step(
    "Should I click on the 'Sign In' button I found?",
    "navigate_signin",
    "explore_001"
)

response = modal_wait_for_response("explore_001", 30)
if response["response"] == "failure":
    # User indicates this isn't right
    modal_ask_question("Can you show me where to click instead?")
    # Enable user demonstration mode
    enable_interaction_monitoring()
```

### 2. Exemplary Testing
Demonstrating correct behavior and capturing it for future use:

**Characteristics:**
- User demonstrates the correct way to perform actions
- LLM observes and learns from user interactions
- Creates reusable patterns from demonstrations
- Builds a library of "how-to" examples

**Example Flow:**
```python
# LLM asks user to demonstrate
modal_show_message("👩‍🏫 Please show me how to complete the checkout process", 5000, "info")

# Inject monitoring script via Chrome Debug Protocol
chrome_inject_script("""
    window.userActions = [];
    document.addEventListener('click', (e) => {
        window.userActions.push({
            type: 'click',
            selector: getSelector(e.target),
            timestamp: Date.now()
        });
    });
    // Additional event listeners for input, navigation, etc.
""")

# Monitor and learn from user actions
modal_show_message("📝 Recording your actions...", 0, "info")
```

### 3. Scripted Testing
Executing learned behaviors in different modes:

#### 3.1 Silent Mode
Runs tests as fast as possible without user interaction:

```python
def run_silent_test(script_name):
    # No modal updates, just execution
    test_script = load_test_script(script_name)
    
    for action in test_script.actions:
        execute_action(action)
        wait_for_dom_settle()  # Minimal wait
    
    return test_results
```

#### 3.2 Narrative Mode
Provides running commentary of test execution:

```python
def run_narrative_test(script_name):
    modal_show_message("📖 Starting narrative test run", 3000, "info")
    test_script = load_test_script(script_name)
    
    for i, action in enumerate(test_script.actions):
        # Explain what's happening
        modal_show_message(
            f"Step {i+1}: {action.description}",
            reading_time(action.description),  # Dynamic duration
            "info"
        )
        
        # Show progress
        modal_progress(
            (i + 1) / len(test_script.actions) * 100,
            f"Executing: {action.short_name}"
        )
        
        # Execute with visual delay
        execute_action(action)
        await asyncio.sleep(1.5)  # Let user see the action
        
        # Optional: Add controls for pause/skip/stop
        if user_requested_pause():
            modal_send_interactive_step(
                "Test paused. Continue?",
                "narrative_pause",
                f"pause_{i}"
            )
            await wait_for_user_continue()
```

#### 3.3 Pedagogical Mode
Guides user through performing the actions themselves:

```python
def run_pedagogical_test(script_name):
    modal_show_message("🎓 Tutorial mode: Follow along!", 3000, "info")
    test_script = load_test_script(script_name)
    
    for i, action in enumerate(test_script.actions):
        # Highlight where to interact
        inject_highlight_script(action.selector)
        
        # Give clear instructions
        modal_send_interactive_step(
            f"Please {action.user_instruction}",
            f"tutorial_step_{i}",
            f"tutorial_{i}",
            priority="info"
        )
        
        # Monitor for correct action
        monitor_user_action(action.expected_action)
        
        response = modal_wait_for_response(f"tutorial_{i}", 60)
        if response["response"] == "success":
            modal_show_message("✅ Perfect! Moving to next step", 2000, "success")
        else:
            # Provide hints or demonstrate
            modal_show_message("💡 Let me show you...", 3000, "info")
            demonstrate_action(action)
```

## Learning and Script Generation

### Interactive Learning Flow

```python
class InteractiveLearner:
    def __init__(self):
        self.learned_actions = []
        self.dom_observer = DOMObserver()
    
    async def learn_from_user(self):
        # 1. User describes intent
        intent = await modal_ask_question(
            "What would you like me to learn to do?"
        )
        
        # 2. LLM attempts based on intent
        modal_show_message("🤖 Let me try to figure this out...", 3000, "info")
        
        success = await self.attempt_action(intent)
        
        if not success:
            # 3. Ask user to demonstrate
            modal_show_message(
                "🤔 I'm not sure how to do that. Can you show me?",
                3000,
                "warning"
            )
            
            # 4. Enable learning mode
            await self.enable_demonstration_mode()
            
            # 5. Capture user actions
            user_actions = await self.capture_user_demonstration()
            
            # 6. Learn from demonstration
            self.learned_actions = self.analyze_demonstration(user_actions)
        
        # 7. Confirm understanding
        modal_send_interactive_step(
            "I think I understand. Should I try it myself now?",
            "confirm_learning",
            "learn_001"
        )
        
        response = await modal_wait_for_response("learn_001", 30)
        if response["response"] == "success":
            await self.replay_learned_actions()
    
    async def generate_script(self):
        # Ask about script type
        modal_ask_question(
            "How should I save this? (literal/generic)",
            options=["Literal - Exact replay", "Generic - Adaptable pattern"]
        )
        
        # Generate appropriate script
        if user_choice == "literal":
            return self.generate_literal_script()
        else:
            return self.generate_generic_script()
```

### DOM Observation and Settlement

```javascript
// Injected script for monitoring DOM changes
class DOMSettlementObserver {
    constructor() {
        this.observer = new MutationObserver(this.handleMutations.bind(this));
        this.pendingChanges = 0;
        this.settlementTimeout = null;
    }
    
    start() {
        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
        });
    }
    
    handleMutations(mutations) {
        this.pendingChanges += mutations.length;
        
        // Reset settlement timer
        clearTimeout(this.settlementTimeout);
        
        this.settlementTimeout = setTimeout(() => {
            if (this.pendingChanges > 0) {
                window.postMessage({
                    type: 'dom_settled',
                    changes: this.pendingChanges,
                    timestamp: Date.now()
                });
                this.pendingChanges = 0;
            }
        }, 500); // Consider settled after 500ms of no changes
    }
    
    // Track specific user interactions
    trackUserAction(event) {
        const actionData = {
            type: event.type,
            target: this.getSelector(event.target),
            value: event.target.value,
            timestamp: Date.now(),
            pageState: this.capturePageState()
        };
        
        window.postMessage({
            type: 'user_action',
            data: actionData
        });
    }
    
    getSelector(element) {
        // Generate robust selector for element
        // Prefer data-testid, then id, then intelligent CSS selector
        if (element.dataset.testid) {
            return `[data-testid="${element.dataset.testid}"]`;
        }
        // ... additional selector logic
    }
}

## MCP Tools Reference

### Display Tools

#### `modal_show_message`
Shows a temporary message that auto-hides:
```python
modal_show_message(
    message="Test starting...",
    duration=3000,  # milliseconds
    priority="info",  # info|success|warning|error
    icon="robot"  # optional icon name
)
```

#### `modal_progress`
Updates the progress bar:
```python
modal_progress(
    progress=75,  # 0-100
    message="Processing step 3 of 4..."  # optional
)
```

#### `modal_hide`
Hides the modal dialog:
```python
modal_hide()
```

### Interactive Tools

#### `modal_send_interactive_step`
Displays interactive buttons and returns immediately:
```python
modal_send_interactive_step(
    message="Verify the page loaded correctly",
    test_step="page_load_check",
    test_id="unique_test_123",  # Must be unique!
    priority="info",
    icon="check"
)
```

#### `modal_wait_for_response`
Waits for user to click a button:
```python
response = modal_wait_for_response(
    test_id="unique_test_123",  # Same ID as send_interactive_step
    timeout=30  # seconds
)
# Returns: {"response": "success"|"failure"|"stop"|"timeout", ...}
```

#### `modal_ask_question`
Shows text input for free-form responses:
```python
modal_ask_question(
    question="What error message do you see?",
    options=["Network Error", "Permission Denied", "Other"]  # Currently shows input box
)
```

### Utility Tools

#### `modal_connect`
Tests connection to the modal server:
```python
result = modal_connect("http://localhost:3001")
```

#### `modal_status`
Gets current server status:
```python
status = modal_status()
# Returns connection info, message counts, etc.
```

#### `modal_test_sequence`
Runs a demo sequence showing all features:
```python
modal_test_sequence()
```

## Configuration

### For AI Assistants (Claude Desktop/Cursor)

**STDIO Mode (Recommended for Claude Desktop):**
```json
{
  "mcpServers": {
    "frontrow-modal": {
      "command": "python",
      "args": ["/path/to/mcp_modal_server.py", "--stdio"],
      "cwd": "/path/to/FrontRow",
      "description": "FrontRow Modal Testing System"
    }
  }
}
```

**HTTP Mode (For network access):**
```json
{
  "mcpServers": {
    "frontrow-modal-http": {
      "url": "http://127.0.0.1:8001/mcp",
      "description": "FrontRow Modal Testing System (HTTP)"
    }
  }
}
```

### Environment Variables
```bash
# Modal server configuration
MODAL_URL=http://localhost:3001

# MCP server configuration
MCP_PORT=8001
MCP_HOST=127.0.0.1

# Development mode
PYTHON_ENV=development  # Enables auto-restart
```

## Best Practices

### 1. Test Organization
- **Unique Test IDs**: Always use unique IDs for interactive steps
- **Descriptive Messages**: Make prompts clear and actionable
- **Timeout Handling**: Always handle timeout cases gracefully
- **Progress Updates**: Keep users informed during long operations

### 2. Error Handling
```python
try:
    modal_send_interactive_step("Verify feature X", "feature_x", "test_123")
    response = modal_wait_for_response("test_123", 30)
    
    if response["response"] == "timeout":
        # User didn't respond - decide how to proceed
        log_timeout("test_123")
        # Maybe retry or skip
        
except Exception as e:
    modal_show_message(f"❌ Test error: {str(e)}", 5000, "error")
    # Clean up and report
```

### 3. User Experience
- **Clear Instructions**: Tell users exactly what to verify
- **Reasonable Timeouts**: 30 seconds default, adjust as needed
- **Visual Feedback**: Use appropriate icons and colors
- **Non-Blocking**: Don't freeze the UI during operations

### 4. Development Workflow
1. Start full environment: `python start_dev.py --full`
2. Make changes to test scripts or MCP server
3. MCP server auto-restarts on changes
4. Test using `python test_modal_mcp.py`
5. Integrate into larger test suites

## Common Issues & Solutions

### Modal Not Appearing
1. Check modal app is running: `ps aux | grep electron`
2. Verify Socket.IO connection in browser console
3. Ensure backend server is accessible on port 3001
4. Try manually showing a message via API

### MCP Tools Not Working
1. Check MCP server logs: `~/mcp_modal_server.log`
2. Restart MCP server (happens automatically in dev mode)
3. Verify correct transport mode (STDIO vs HTTP)
4. Test with `modal_status()` tool first

### Interactive Steps Not Responding
1. Ensure test IDs are unique across your test run
2. Check modal has focus (click on it)
3. Verify WebSocket connection is active
4. Look for response in backend logs

### Auto-Restart Not Working
1. Ensure running in development mode
2. Check file permissions on watched files
3. Verify Python file watching is enabled
4. Manual restart: `Ctrl+C` then restart script

## Proposed Enhancements

### 1. Enhanced Interactive Controls
- **Multiple Choice Buttons**: Replace text input with actual buttons for options
- **Inline Screenshots**: Display screenshots within the modal for visual verification
- **Annotation Tools**: Allow users to mark areas of concern on screenshots
- **Voice Notes**: Record audio feedback for complex issues

### 2. Test Recording & Playback
- **Action Recording**: Capture user interactions for replay
- **Visual Regression**: Automatic screenshot comparison
- **Test Generation**: Convert recorded sessions to test scripts
- **Playback Speed Control**: Run recorded tests at various speeds

### 3. Multi-Agent Coordination
- **Agent Roles**: Assign specific roles (tester, reviewer, debugger)
- **Parallel Testing**: Coordinate multiple test streams
- **Result Aggregation**: Combine results from multiple agents
- **Communication Protocol**: Inter-agent messaging for complex scenarios

### 4. Advanced Analytics
- **Test Metrics Dashboard**: Real-time test performance metrics
- **Failure Pattern Analysis**: ML-based failure prediction
- **Performance Profiling**: Identify slow test segments
- **Coverage Visualization**: Show tested vs untested paths

### 5. Integration Expansions
- **CI/CD Integration**: GitHub Actions, Jenkins, GitLab CI
- **Bug Tracking**: Auto-create issues in Jira/GitHub
- **Slack/Teams Notifications**: Real-time test status updates
- **Video Recording**: Full test session recording

### 6. Developer Tools
- **Test Debugger**: Step through tests with breakpoints
- **State Inspector**: View application state at each step
- **Network Monitor**: Track API calls during tests
- **Console Integration**: Capture and display console logs

### 7. Accessibility Testing
- **Screen Reader Integration**: Test with accessibility tools
- **Contrast Checking**: Verify visual accessibility
- **Keyboard Navigation**: Test without mouse input
- **WCAG Compliance**: Automated accessibility scoring

### 8. Learning and Adaptation System
- **Interaction Monitoring**: Chrome Debug Protocol integration for capturing user actions
- **Pattern Recognition**: Identify reusable test patterns from demonstrations
- **Script Generation**: Convert learned behaviors into executable test scripts
- **Adaptive Execution**: Run tests in silent, narrative, or pedagogical modes

### 9. Enhanced Modal Dialog Features
- **Demonstration Request**: "Show me how" functionality for learning mode
- **Action Confirmation**: Step-by-step verification during exploratory testing
- **Progress Control**: Pause, skip, and speed controls for narrative mode
- **Tutorial Highlights**: Visual indicators for pedagogical mode

### 10. Chrome Debug Protocol Integration
- **DOM Settlement Detection**: Monitor when page changes have stabilized
- **User Action Recording**: Capture clicks, inputs, and navigation
- **Element Selection**: Intelligent selector generation for reliability
- **State Capture**: Record page state at each interaction point

## Testing Philosophy

The FrontRow Testing System embraces three fundamental testing modes:

1. **Exploratory Testing**: Where AI and humans collaborate to discover application behavior through trial, error, and learning.

2. **Exemplary Testing**: Where users demonstrate correct behavior, and the system learns to replicate and generalize from these examples.

3. **Scripted Testing**: Where learned behaviors are executed in different modes:
   - **Silent**: Fast, unattended execution
   - **Narrative**: Explained execution with visual feedback
   - **Pedagogical**: Interactive tutorials guiding users through workflows

This approach acknowledges that effective testing requires both human intuition and machine efficiency, creating a symbiotic relationship that produces more robust and maintainable test suites.

## Conclusion

The FrontRow Testing System represents a new paradigm in test automation - one that acknowledges the value of human judgment while leveraging the power of AI and automation. By providing a visual, interactive layer on top of traditional testing tools, it enables more reliable, maintainable, and understandable test suites.

The system's modular architecture ensures it can grow with your needs, from simple smoke tests to complex multi-agent scenarios. Whether you're a developer manually testing features, writing automated test suites, or an AI assistant orchestrating comprehensive test scenarios, the FrontRow Testing System provides the tools and patterns you need for success.