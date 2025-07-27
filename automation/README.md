# FrontRow Automation Tools

This directory contains automation utilities for testing and development of the FrontRow application.

## LLM-Driven E2E Testing System

### Quick Start
```bash
# Natural language testing
python frontrow_test_orchestrator.py "Test with 3 audience members in Dev"
python frontrow_test_orchestrator.py "Test with one audience member live stream"

# Run example scenarios
python test_examples.py
```

### Components

#### FRONTROW_TESTING_GUIDE.md
Comprehensive guide for LLMs to understand and orchestrate FrontRow testing. Explains:
- Natural language command parsing
- Test scenarios and components
- Error diagnosis and recovery
- Best practices

#### frontrow_test_orchestrator.py
Core testing framework providing:
- Environment management (Dev/Prod)
- Browser automation via Playwright MCP
- Server test API integration
- User journey automation
- R3F scene interaction (`window.__FRONTROW_SCENE__.clickSeat()`)

#### test_examples.py
Example test scenarios demonstrating:
- Natural language test execution
- Component-based testing
- Custom scenarios
- Diagnostic utilities

### Natural Language Commands
- `"Test the app with one audience member in Dev"` - Basic single user test
- `"Test with 5 audience members in Prod"` - Multi-user production test
- `"Test with one audience member live stream"` - Live streaming test
- `"Continue testing"` - Resume from previous state

### Key Features
- **Dynamic Composition**: LLM decides whether to call components sequentially or write custom scripts
- **Auto-Diagnosis**: Detects and suggests fixes for common issues
- **Chrome Management**: Auto-launches Chrome debug if not running
- **R3F Integration**: Direct seat clicking via exposed Three.js scene
- **Quick Summaries**: Concise test results with actionable feedback

## Desktop Switching Utilities

### desktop_switching.py
Core utilities for desktop/app management on macOS during testing.

### Desktop Switching (macOS Spaces)

**From Desktop 1 (Cursor) to Desktop 2 (Chrome):**
```
ctrl-up → ctrl-right → esc
```

**From Desktop 2 (Chrome) to Desktop 1 (Cursor):**  
```
ctrl-up → ctrl-left → esc
```

**Timing:** Use 0.1 second delays between keypresses (optimized for speed)

### App Switching via Spotlight

**Switch to Chrome:**
```
cmd-space → type "Chrome" → enter
```

**Switch to Cursor:**
```
cmd-space → type "Cursor" → enter  
```

**Note:** Spotlight may open different Chrome instances (Chrome vs Chrome1), so desktop switching is more reliable for the FRONT ROW application.

### Context Detection

The `DesktopManager` class can detect:
- Current active application and window title
- Whether Chrome with FRONT ROW is visible (indicates correct desktop)
- Navigation recommendations

## Usage Examples

### Basic Context Check
```python
from automation.desktop_switching import DesktopManager

manager = DesktopManager()
context = manager.get_current_context()

print(f"Current app: {context['active_app']['app']}")
print(f"Recommendation: {context['recommendation']}")
```

### Automated Desktop Switching (with dt-server)
```python
# Assuming you have dt_server_client configured
manager = DesktopManager(dt_server_client)
success = manager.switch_to_desktop_right()
```

### Manual Instructions
```python
# Get step-by-step instructions for manual execution
manager = DesktopManager()  # No dt_server_client
instructions = manager.switch_to_desktop_right()
for step in instructions['instructions']:
    print(step)
```

## Integration with Testing

For test automation:

1. **Check current context** to determine where you are
2. **Navigate to correct desktop** if needed  
3. **Confirm you're in the right app** before proceeding
4. **Switch back to Cursor** when done for user communication

## Troubleshooting

**Problem:** Desktop switching doesn't work
- **Solution:** Ensure Mission Control keyboard shortcuts are enabled in System Preferences → Keyboard → Shortcuts → Mission Control

**Problem:** Can't find Chrome with FRONT ROW
- **Solution:** The Chrome instance is on a different desktop. Use desktop switching to navigate there.

**Problem:** Wrong Chrome instance opens with Spotlight
- **Solution:** Use desktop switching instead of Spotlight to reach the correct Chrome instance.

**Problem:** Playwright MCP server not responding
- **Solution:** Ensure Chrome is running with debugging on port 9222 (`./launch_chrome.py`)

**Problem:** R3F scene not accessible
- **Solution:** Check that SceneTestExposer is included in the app and `window.__FRONTROW_SCENE__` is available

## Future Enhancements

- Add support for more complex window arrangements
- Integrate with additional browser automation tools
- Add error recovery mechanisms
- Support for multiple monitor setups
- Visual regression testing with screenshots
- Performance benchmarking tools