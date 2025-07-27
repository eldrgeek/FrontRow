# FrontRow E2E Testing Guide for LLMs

## Overview
This guide enables LLMs to orchestrate comprehensive end-to-end testing of the FrontRow virtual theater application. When a user requests testing (e.g., "Test with 3 audience members in Prod"), you will interpret the command and compose the appropriate test components.

## Quick Start Examples
- "Test the app with one audience member in Dev" → Basic single-user test on localhost
- "Test with 5 audience members in Prod" → Multi-user test on frontrowtheater.netlify.app
- "Test with one audience member live stream" → Test live streaming functionality
- "Continue testing" → Resume from last test state

## Testing Environments

### Dev Environment
- Frontend: http://localhost:5173
- Backend: http://localhost:3001
- Dashboard: http://localhost:3001/dashboard

### Prod Environment  
- Frontend: https://frontrowtheater.netlify.app
- Backend: https://frontrow-production.onrender.com
- Dashboard: https://frontrow-production.onrender.com/dashboard

## Core Components

### 1. Browser Automation
- **Chrome Debug**: Must be running on port 9222 (`./launch_chrome.py`)
- **Tab Management**: Each user gets a separate tab
- **R3F Scene Access**: `window.__FRONTROW_SCENE__.clickSeat('seat-4')`

### 2. Server Test API
- `GET /api/test/state` - Complete server state
- `POST /api/test/reset` - Reset server to clean state
- `POST /api/test/seats/:seatId/assign` - Force seat assignment
- `POST /api/test/show/state` - Change show state
- `GET /api/test/events` - Event history

### 3. User Journey Steps
1. **Login**: Enter name, capture photo
2. **Stream Choice**: Select photo or video mode
3. **Enter Venue**: Load 3D theater
4. **Select Seat**: Click seat using R3F scene
5. **Wait for Show**: Countdown or live stream
6. **Verify State**: Check server and client state

## Test Scenarios

### Basic Countdown Test (Default)
1. Reset server
2. Create user(s)
3. Complete user journey
4. Start 10-second countdown
5. Verify show goes live
6. Check applause triggers

### Live Stream Test
1. Create performer user
2. Create audience users
3. Performer starts stream
4. Verify WebRTC connections
5. Check video display on stage

### Seat Conflict Test
1. Multiple users attempt same seat
2. Verify first user gets seat
3. Others see seat as occupied
4. Test seat switching

## Command Parsing Rules

### User Count
- "one"/"1"/"a" → 1 user
- "two"/"2" → 2 users
- Numbers up to 9 supported
- Default: 1 user

### Environment
- "Dev"/"development"/"localhost" → Dev
- "Prod"/"production"/"netlify" → Prod
- Default: Dev

### Test Type
- "countdown" → Basic countdown test
- "live stream"/"streaming" → Live stream test
- "conflict" → Seat conflict test
- Default: Basic countdown

## Execution Approach

### Sequential Execution
Use for simple tests:
```python
coordinator.reset_server()
user = coordinator.create_user("Mike")
coordinator.login_user(user)
coordinator.select_seat(user, "seat-4")
```

### Script Composition
Use for complex multi-user scenarios:
```python
script = coordinator.compose_script([
    ParallelAction([
        UserJourney("Mike", 0),
        UserJourney("George", 1),
        UserJourney("Noel", 2)
    ]),
    WaitForCountdown(),
    VerifyShowLive()
])
```

## Error Handling

### Diagnosis Steps
1. Check Chrome debug status
2. Verify server is running
3. Inspect console errors
4. Check network requests
5. Validate server state

### Auto-Fix Options
- Restart Chrome debug
- Reset server state
- Retry failed operations
- Fix timing issues

### User Confirmation
Always ask before:
- Modifying application code
- Restarting services
- Changing test approach

## Reporting Format

### Quick Summary
```
✅ Test Completed: 3 audience members in Prod
Duration: 45 seconds
Users created: 3/3
Seats selected: 3/3
Show state: Live
Issues: None
```

### Failure Summary
```
❌ Test Failed: Seat selection error
User: Mike (tab 0)
Step: Select seat
Error: Seat-4 not clickable
Suggestion: Check R3F scene exposure
```

## State Management

### Fresh Start (Default)
- Reset server
- Close all tabs
- Clear browser storage
- Start from login

### Continue Testing
- Preserve current tabs
- Keep server state
- Resume from last step
- Verify state before proceeding

## Best Practices

1. **Always verify Chrome debug** before starting
2. **Use parallel execution** for multi-user tests
3. **Add small delays** between critical actions
4. **Check server state** after each major step
5. **Take screenshots** on failures
6. **Keep summaries concise** unless asked for details

## Component Priority

### High-Level Components (Use First)
- `RunBasicTest(users, environment)`
- `RunLiveStreamTest(audience_count)`
- `RunSeatConflictTest()`

### Mid-Level Components
- `CompleteUserJourney(name, tab_index)`
- `SetupPerformer(name)`
- `StartCountdown(duration)`

### Low-Level Components (For Debugging)
- `LoginUser(name, tab_index)`
- `SelectSeat(tab_index, seat_id)`
- `VerifyServerState(expected)`

## Common Issues & Solutions

### "Chrome not found"
→ Run `./launch_chrome.py` in FrontRow directory

### "Seat not clickable"
→ Verify R3F scene is exposed with `window.__FRONTROW_SCENE__`

### "Server not responding"
→ Check if backend is running on correct port

### "Login form not visible"
→ Wait for page load or check for overlays

When executing tests, always start with the simplest approach and add complexity only if needed. The goal is reliable, fast testing with clear feedback to the user.