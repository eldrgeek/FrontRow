# E2E Testing Architecture for FrontRow

## Current State & Goals

**Current Setup:**
- Frontend: React app (localhost:5173) with built-in TestSeatPicker
- Backend: Node.js + Socket.io server (localhost:3001) 
- Dashboard: Available at localhost:3001/dashboard
- Testing: Playwright MCP server for browser automation

**Goal:** Create a comprehensive, fast, and reliable e2e testing system with complete visibility into application state during testing.

## Core Testing Challenges

1. **State Visibility**: Need real-time insight into both client and server state
2. **Multi-user Coordination**: Testing scenarios with multiple simultaneous users
3. **Timing & Synchronization**: Ensuring events complete before next test steps
4. **Event Tracking**: Monitoring Socket.io events, seat selections, connections
5. **Test Data Management**: Setup/teardown of test scenarios
6. **Feature Validation**: Rapid testing of new features during development

## Required Information Architecture

### Server-Side State Visibility
```json
{
  "users": {
    "socketId": {
      "name": "George",
      "seat": "seat-3", 
      "captureMode": "photo",
      "connectionTime": "2025-01-24T10:30:00Z",
      "isPerformer": false
    }
  },
  "seats": {
    "seat-0": null,
    "seat-1": null, 
    "seat-2": null,
    "seat-3": "socketId",
    "seat-4": null
  },
  "showState": "idle",
  "eventHistory": [
    {
      "timestamp": "2025-01-24T10:30:15Z",
      "type": "seat-selected",
      "user": "George",
      "seat": "seat-3",
      "socketId": "abc123"
    }
  ],
  "metrics": {
    "connectedUsers": 3,
    "occupiedSeats": 1,
    "messagesPerSecond": 2.5
  }
}
```

### Client-Side State Visibility  
```json
{
  "tabId": "tab-0",
  "user": {
    "name": "George",
    "isLoggedIn": true,
    "selectedSeat": "seat-3",
    "captureMode": "photo",
    "currentView": "user"
  },
  "ui": {
    "showTestSeatPicker": false,
    "showStreamChoice": false,
    "welcomeSequenceStarted": true
  },
  "webgl": {
    "supported": true,
    "contextCreated": true,
    "sceneLoaded": true
  }
}
```

## Proposed E2E Architecture

### 1. Enhanced Server Test API

**New Endpoint: `/api/test`**
```javascript
// GET /api/test/state - Complete server state snapshot
// POST /api/test/reset - Reset server to clean state  
// POST /api/test/users - Create test users
// DELETE /api/test/users/:socketId - Remove test user
// POST /api/test/seats/:seatId/assign/:userId - Force seat assignment
// POST /api/test/show/state - Change show state (idle/pre-show/live/post-show)
// GET /api/test/events - Get event history with filtering
// POST /api/test/simulate - Simulate server events for testing
```

**WebSocket Test Channel:**
```javascript
// Real-time test events on 'test-channel'
socket.emit('test-subscribe'); // Subscribe to test events
// Receive: state-changed, user-connected, seat-selected, etc.
```

### 2. Python Test Coordinator

**Architecture:**
```python
class FrontRowE2ETest:
    def __init__(self):
        self.server_api = ServerTestAPI("http://localhost:3001")
        self.playwright = PlaywrightManager()
        self.test_state = TestStateManager()
        
    async def run_scenario(self, scenario_name):
        # 1. Setup clean state
        await self.server_api.reset()
        
        # 2. Launch browser tabs  
        tabs = await self.playwright.create_tabs(count=3)
        
        # 3. Execute test steps with state validation
        for step in scenario.steps:
            await self.execute_step(step)
            await self.validate_state(step.expected_state)
            
        # 4. Generate report
        return self.generate_report()
```

**Key Features:**
- Parallel browser tab management
- Real-time server state monitoring  
- Automatic state assertions
- Screenshot/video capture at key moments
- Performance timing measurements
- Detailed failure diagnosis

### 3. Test Scenario Framework

**Scenario Definition:**
```python
multi_user_seat_selection = TestScenario(
    name="Multi-User Seat Selection",
    description="Test 3 users selecting different seats simultaneously",
    steps=[
        Step("setup_users", 
             action=SetupUsers(["Alice", "Bob", "Charlie"]),
             expected_server_state={"connectedUsers": 3}),
             
        Step("enter_venue_parallel",
             action=ParallelAction([
                 EnterVenue(tab=0, user="Alice"),
                 EnterVenue(tab=1, user="Bob"), 
                 EnterVenue(tab=2, user="Charlie")
             ]),
             expected_client_state={"all_in_venue": True}),
             
        Step("select_seats",
             action=ParallelAction([
                 SelectSeat(tab=0, seat=1),
                 SelectSeat(tab=1, seat=3),
                 SelectSeat(tab=2, seat=7)
             ]),
             expected_server_state={
                 "seats": {"seat-0": "Alice", "seat-2": "Bob", "seat-6": "Charlie"}
             }),
             
        Step("validate_visual_state",
             action=TakeScreenshots(),
             assertions=[
                 VisualAssertion("seats_occupied", expected_count=3),
                 UIAssertion("view_controls_visible", tab=0)
             ])
    ]
)
```

### 4. Enhanced Dashboard Integration

**Real-time Test Monitor:**
- Live view of all connected test users
- Visual seat occupancy map
- Event stream with filtering
- Performance metrics graphs
- Test progress tracking
- Failure alerts and debugging info

**Dashboard Test Controls:**
- Start/stop test runs
- Reset server state
- Force user disconnections
- Simulate network issues
- Generate test data

### 5. Client-Side Test Enhancements

**Enhanced TestSeatPicker:**
```typescript
interface TestMode {
  enabled: boolean;
  userId: string;
  scenario: string;
  stepIndex: number;
  automate: boolean; // Auto-execute test steps
}

// Add test automation capabilities
const useTestAutomation = () => {
  useEffect(() => {
    if (testMode.automate) {
      executeNextTestStep();
    }
  }, [testMode.stepIndex]);
};
```

**Test State Exposure:**
```typescript
// Expose internal state for testing
if (import.meta.env.MODE === 'development') {
  window.__FRONTROW_TEST_STATE__ = {
    userName,
    selectedSeat,
    currentView,
    audienceSeats,
    showState,
    isLoggedIn
  };
}
```

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Implement server test API endpoints
- [ ] Add WebSocket test channel
- [ ] Create basic Python test coordinator
- [ ] Enhance client test state exposure

### Phase 2: Core Testing (Week 2)  
- [ ] Build scenario execution framework
- [ ] Implement state validation system
- [ ] Add screenshot/visual testing
- [ ] Create basic test scenarios

### Phase 3: Advanced Features (Week 3)
- [ ] Real-time test monitoring dashboard
- [ ] Performance benchmarking
- [ ] Visual regression testing
- [ ] CI/CD integration

### Phase 4: Feature Testing (Ongoing)
- [ ] Rapid new feature validation
- [ ] A/B testing support
- [ ] Load testing capabilities
- [ ] Error injection testing

## Test Scenarios to Implement

### Basic User Flows
1. **Single User Journey**: Login → Photo → Venue → Seat Selection
2. **Multi-User Coordination**: 3 users entering and selecting seats
3. **Seat Switching**: User changes from one seat to another
4. **Performer Mode**: Artist login and stream management

### Edge Cases & Error Handling
5. **Seat Conflicts**: Multiple users trying same seat
6. **Connection Issues**: User disconnect/reconnect scenarios
7. **Invalid States**: Malformed data, timing issues
8. **Browser Compatibility**: Different browsers/devices

### Performance & Load
9. **Concurrent Users**: 10+ users simultaneous testing
10. **Rapid Actions**: Fast seat switching, spam clicking
11. **Memory Leaks**: Long-running sessions
12. **Network Latency**: Simulated slow connections

### Feature Development
13. **New Feature Validation**: Automated testing of new features
14. **Regression Testing**: Ensure existing features still work
15. **A/B Testing**: Compare different implementations
16. **Integration Testing**: Third-party service integration

## Success Metrics

- **Speed**: Complete test suite runs in < 5 minutes
- **Reliability**: 99.9% test consistency (no flaky tests)
- **Coverage**: 100% of user-facing features tested
- **Visibility**: Complete state visibility during testing
- **Automation**: New features auto-tested on commit
- **Debugging**: Failed tests provide actionable diagnosis

This architecture would provide the comprehensive visibility and rapid testing capabilities needed for robust e2e testing of the FrontRow application.