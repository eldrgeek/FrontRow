#!/usr/bin/env python3
"""
FrontRow E2E Test Coordinator

A comprehensive end-to-end testing system that provides complete visibility 
into client and server state during automated testing of the FrontRow application.
"""

import asyncio
import json
import time
from typing import Dict, List, Any, Optional
import aiohttp
from dataclasses import dataclass
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@dataclass
class TestUser:
    name: str
    tab_index: int
    socket_id: Optional[str] = None
    seat_id: Optional[str] = None
    expected_seat: Optional[str] = None

@dataclass
class TestStep:
    name: str
    description: str
    action: str
    expected_state: Dict[str, Any]
    timeout: int = 30

@dataclass
class TestScenario:
    name: str
    description: str
    users: List[TestUser]
    steps: List[TestStep]

class FrontRowE2ETestCoordinator:
    def __init__(self, server_url: str = "http://localhost:3001", frontend_url: str = "http://localhost:5173"):
        self.server_url = server_url
        self.frontend_url = frontend_url
        self.test_results = []
        self.start_time = None
        
    async def get_server_state(self) -> Dict[str, Any]:
        """Get current server state via test API"""
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{self.server_url}/api/test/state") as response:
                if response.status == 200:
                    return await response.json()
                else:
                    raise Exception(f"Failed to get server state: {response.status}")
    
    async def reset_server_state(self) -> Dict[str, Any]:
        """Reset server to clean state"""
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{self.server_url}/api/test/reset") as response:
                if response.status == 200:
                    return await response.json()
                else:
                    raise Exception(f"Failed to reset server: {response.status}")
    
    async def force_assign_seat(self, socket_id: str, seat_id: str, user_name: str) -> Dict[str, Any]:
        """Force assign a seat for testing"""
        data = {
            "socketId": socket_id,
            "userName": user_name,
            "captureMode": "photo"
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{self.server_url}/api/test/seats/{seat_id}/assign", json=data) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    raise Exception(f"Failed to assign seat: {response.status}")
    
    async def change_show_state(self, status: str, artist_id: Optional[str] = None) -> Dict[str, Any]:
        """Change show state for testing"""
        data = {"status": status}
        if artist_id:
            data["artistId"] = artist_id
        
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{self.server_url}/api/test/show/state", json=data) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    raise Exception(f"Failed to change show state: {response.status}")
    
    async def get_test_events(self, limit: int = 50, event_type: Optional[str] = None) -> Dict[str, Any]:
        """Get test event history"""
        params = {"limit": limit}
        if event_type:
            params["type"] = event_type
            
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{self.server_url}/api/test/events", params=params) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    raise Exception(f"Failed to get test events: {response.status}")
    
    async def send_modal_message(self, message: str, duration: int = 3000, 
                               priority: str = "info", icon: str = "info") -> Dict[str, Any]:
        """Send message to modal via API"""
        data = {
            "message": message,
            "duration": duration,
            "priority": priority,
            "icon": icon
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{self.server_url}/api/test/modal", json=data) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    raise Exception(f"Failed to send modal message: {response.status}")
    
    async def send_modal_progress(self, progress: int, message: str = "") -> Dict[str, Any]:
        """Send progress update to modal"""
        data = {
            "action": "progress",
            "message": message,
            "progress": progress
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{self.server_url}/api/test/modal", json=data) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    raise Exception(f"Failed to send modal progress: {response.status}")

    async def send_interactive_step(self, message: str, test_step: str, test_id: str, 
                                   priority: str = "info", icon: str = "info") -> Dict[str, Any]:
        """Send an interactive test step to the modal and wait for user response."""
        data = {
            "message": message,
            "priority": priority,
            "icon": icon,
            "interactive": True,
            "testStep": test_step,
            "testId": test_id
        }
        
        # Send the interactive step
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{self.server_url}/api/test/modal", json=data) as response:
                if response.status == 200:
                    result = await response.json()
                else:
                    raise Exception(f"Failed to send interactive step: {response.status}")
        
        # Wait for user response
        response = await self.wait_for_test_response(test_id)
        return response

    async def wait_for_test_response(self, test_id: str, timeout: int = 300) -> Dict[str, Any]:
        """Wait for user response to an interactive test step."""
        url = f"{self.server_url}/api/test/response/{test_id}"
        
        start_time = time.time()
        while time.time() - start_time < timeout:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status == 200:
                        result = await response.json()
                        
                        if result.get("response") is not None:
                            return result
                    else:
                        logger.warning(f"Failed to get test response: {response.status}")
            
            await asyncio.sleep(1)  # Poll every second
        
        # Timeout - clear the response and return timeout
        await self.clear_test_response(test_id)
        return {"response": "timeout", "step": "unknown", "timestamp": time.time()}

    async def clear_test_response(self, test_id: str) -> Dict[str, Any]:
        """Clear a test response."""
        url = f"{self.server_url}/api/test/response/{test_id}"
        
        async with aiohttp.ClientSession() as session:
            async with session.delete(url) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    raise Exception(f"Failed to clear test response: {response.status}")
    
    def validate_server_state(self, actual_state: Dict[str, Any], expected_state: Dict[str, Any]) -> List[str]:
        """Validate server state matches expectations"""
        errors = []
        
        for key, expected_value in expected_state.items():
            if key == "users.count":
                actual_count = len(actual_state.get("users", {}))
                if actual_count != expected_value:
                    errors.append(f"Expected {expected_value} users, got {actual_count}")
            
            elif key == "seats.occupied_count":
                actual_count = actual_state.get("seats", {}).get("occupiedCount", 0)
                if actual_count != expected_value:
                    errors.append(f"Expected {expected_value} occupied seats, got {actual_count}")
            
            elif key == "show.status":
                actual_status = actual_state.get("show", {}).get("status")
                if actual_status != expected_value:
                    errors.append(f"Expected show status '{expected_value}', got '{actual_status}'")
            
            elif key.startswith("seat."):
                seat_id = key.split(".", 1)[1]
                occupied_seats = actual_state.get("seats", {}).get("occupied", {})
                if expected_value is None:
                    if seat_id in occupied_seats:
                        errors.append(f"Expected seat {seat_id} to be empty, but it's occupied")
                else:
                    if seat_id not in occupied_seats:
                        errors.append(f"Expected seat {seat_id} to be occupied, but it's empty")
                    elif occupied_seats[seat_id].get("name") != expected_value:
                        actual_name = occupied_seats[seat_id].get("name")
                        errors.append(f"Expected {expected_value} in seat {seat_id}, got {actual_name}")
        
        return errors
    
    async def run_test_step(self, step: TestStep, users: List[TestUser]) -> Dict[str, Any]:
        """Execute a single test step"""
        logger.info(f"🧪 Executing step: {step.name} - {step.description}")
        step_start_time = time.time()
        
        try:
            # Execute step action
            if step.action == "reset_server":
                await self.reset_server_state()
            
            elif step.action == "get_server_state":
                await self.get_server_state()
            
            elif step.action.startswith("assign_seat:"):
                # Format: "assign_seat:user_name:seat_id"
                _, user_name, seat_id = step.action.split(":")
                user = next((u for u in users if u.name == user_name), None)
                if user and user.socket_id:
                    await self.force_assign_seat(user.socket_id, seat_id, user_name)
                    user.seat_id = seat_id
            
            elif step.action.startswith("change_show_state:"):
                # Format: "change_show_state:status" or "change_show_state:status:artist_id"
                parts = step.action.split(":")
                status = parts[1]
                artist_id = parts[2] if len(parts) > 2 else None
                await self.change_show_state(status, artist_id)
            
            # Wait a moment for state to propagate
            await asyncio.sleep(0.5)
            
            # Validate expected state
            current_state = await self.get_server_state()
            validation_errors = self.validate_server_state(current_state, step.expected_state)
            
            step_duration = time.time() - step_start_time
            
            if validation_errors:
                logger.error(f"❌ Step failed: {step.name}")
                for error in validation_errors:
                    logger.error(f"   • {error}")
                
                return {
                    "step": step.name,
                    "status": "failed",
                    "duration": step_duration,
                    "errors": validation_errors,
                    "server_state": current_state
                }
            else:
                logger.info(f"✅ Step passed: {step.name} ({step_duration:.2f}s)")
                return {
                    "step": step.name,
                    "status": "passed",
                    "duration": step_duration,
                    "server_state": current_state
                }
        
        except Exception as e:
            step_duration = time.time() - step_start_time
            logger.error(f"💥 Step error: {step.name} - {str(e)}")
            return {
                "step": step.name,
                "status": "error",
                "duration": step_duration,
                "error": str(e)
            }
    
    async def run_scenario(self, scenario: TestScenario) -> Dict[str, Any]:
        """Execute a complete test scenario"""
        logger.info(f"🚀 Starting scenario: {scenario.name}")
        logger.info(f"📝 Description: {scenario.description}")
        
        scenario_start_time = time.time()
        step_results = []
        
        try:
            # Get initial server state and extract socket IDs for users
            initial_state = await self.get_server_state()
            connected_sockets = list(initial_state.get("users", {}).keys())
            
            # Assign socket IDs to test users (in order of tab_index)
            sorted_users = sorted(scenario.users, key=lambda u: u.tab_index)
            for i, user in enumerate(sorted_users):
                if i < len(connected_sockets):
                    user.socket_id = connected_sockets[i]
                    logger.info(f"👤 Assigned socket {user.socket_id} to user {user.name} (tab {user.tab_index})")
            
            # Execute each test step
            for step in scenario.steps:  
                step_result = await self.run_test_step(step, scenario.users)
                step_results.append(step_result)
                
                # Stop on first failure (optional - could be configurable)
                if step_result["status"] in ["failed", "error"]:
                    logger.warning(f"⏹️  Stopping scenario due to step failure: {step.name}")
                    break
            
            scenario_duration = time.time() - scenario_start_time
            passed_steps = len([r for r in step_results if r["status"] == "passed"])
            total_steps = len(step_results)
            
            scenario_status = "passed" if passed_steps == len(scenario.steps) else "failed"
            
            logger.info(f"🏁 Scenario completed: {scenario.name}")
            logger.info(f"📊 Result: {passed_steps}/{len(scenario.steps)} steps passed ({scenario_duration:.2f}s)")
            
            return {
                "scenario": scenario.name,
                "status": scenario_status,
                "duration": scenario_duration,
                "steps_passed": passed_steps,
                "steps_total": len(scenario.steps),
                "step_results": step_results,
                "final_server_state": await self.get_server_state()
            }
        
        except Exception as e:
            scenario_duration = time.time() - scenario_start_time
            logger.error(f"💥 Scenario error: {scenario.name} - {str(e)}")
            return {
                "scenario": scenario.name,
                "status": "error",
                "duration": scenario_duration,
                "error": str(e),
                "step_results": step_results
            }
    
    async def generate_test_report(self, results: List[Dict[str, Any]]) -> str:
        """Generate a comprehensive test report"""
        total_duration = time.time() - self.start_time if self.start_time else 0
        total_scenarios = len(results)
        passed_scenarios = len([r for r in results if r["status"] == "passed"])
        
        report = f"""
# FrontRow E2E Test Report
Generated: {datetime.now().isoformat()}
Total Duration: {total_duration:.2f}s

## Summary
- **Scenarios**: {passed_scenarios}/{total_scenarios} passed
- **Overall Status**: {'✅ PASSED' if passed_scenarios == total_scenarios else '❌ FAILED'}

## Scenario Results
"""
        
        for result in results:
            status_icon = "✅" if result["status"] == "passed" else "❌"
            report += f"""
### {status_icon} {result['scenario']} ({result.get('duration', 0):.2f}s)
- Status: {result['status']}
- Steps: {result.get('steps_passed', 0)}/{result.get('steps_total', 0)} passed
"""
            
            if result.get("step_results"):
                for step in result["step_results"]:
                    step_icon = "✅" if step["status"] == "passed" else "❌"
                    report += f"  - {step_icon} {step['step']} ({step.get('duration', 0):.2f}s)\n"
                    
                    if step.get("errors"):
                        for error in step["errors"]:
                            report += f"    • {error}\n"
        
        # Get final server state and event log
        try:
            final_state = await self.get_server_state()
            test_events = await self.get_test_events(limit=20)
            
            report += f"""
## Final Server State
- Connected Users: {len(final_state.get('users', {}))}
- Occupied Seats: {final_state.get('seats', {}).get('occupiedCount', 0)}/9
- Show Status: {final_state.get('show', {}).get('status', 'unknown')}

## Recent Test Events
"""
            for event in test_events.get("events", [])[-10:]:  # Last 10 events
                report += f"- {event['timestamp']}: {event['type']} - {event.get('data', {})}\n"
                
        except Exception as e:
            report += f"\n## Error getting final state: {str(e)}\n"
        
        return report

# Define test scenarios
def create_multi_user_seat_selection_scenario() -> TestScenario:
    """Test multiple users selecting different seats"""
    return TestScenario(
        name="Multi-User Seat Selection",
        description="Test 3 users selecting different seats with server state validation",
        users=[
            TestUser("Alice", tab_index=0),
            TestUser("Bob", tab_index=1), 
            TestUser("Charlie", tab_index=2)
        ],
        steps=[
            TestStep(
                name="reset_server",
                description="Reset server to clean state",
                action="reset_server",
                expected_state={"show.status": "idle", "seats.occupied_count": 0}
            ),
            TestStep(
                name="assign_seats",
                description="Assign different seats to each user",
                action="assign_seat:Alice:seat-1",
                expected_state={"seats.occupied_count": 1, "seat.seat-1": "Alice"}
            ),
            TestStep(
                name="assign_more_seats",
                description="Assign seat to Bob",
                action="assign_seat:Bob:seat-4",
                expected_state={"seats.occupied_count": 2, "seat.seat-4": "Bob"}
            ),
            TestStep(
                name="assign_final_seat",
                description="Assign seat to Charlie",
                action="assign_seat:Charlie:seat-7",
                expected_state={
                    "seats.occupied_count": 3, 
                    "seat.seat-1": "Alice",
                    "seat.seat-4": "Bob", 
                    "seat.seat-7": "Charlie"
                }
            ),
        ]
    )

def create_show_state_transition_scenario() -> TestScenario:
    """Test show state transitions"""
    return TestScenario(
        name="Show State Transitions",
        description="Test transitioning through different show states",
        users=[
            TestUser("Artist", tab_index=0)
        ],
        steps=[
            TestStep(
                name="reset_server",
                description="Reset server to clean state",
                action="reset_server",
                expected_state={"show.status": "idle"}
            ),
            TestStep(
                name="go_live",
                description="Change show to live state",
                action="change_show_state:live:test-artist-id",
                expected_state={"show.status": "live"}
            ),
            TestStep(
                name="end_show",
                description="End the show",
                action="change_show_state:post-show",
                expected_state={"show.status": "post-show"}
            ),
        ]
    )

async def main():
    """Main test execution"""
    coordinator = FrontRowE2ETestCoordinator()
    coordinator.start_time = time.time()
    
    # Define test scenarios
    scenarios = [
        create_multi_user_seat_selection_scenario(),
        create_show_state_transition_scenario()
    ]
    
    logger.info("🧪 Starting FrontRow E2E Test Suite")
    logger.info(f"🎯 Server: {coordinator.server_url}")
    logger.info(f"🎯 Frontend: {coordinator.frontend_url}")
    
    results = []
    
    # Execute each scenario
    for scenario in scenarios:
        result = await coordinator.run_scenario(scenario)
        results.append(result)
    
    # Generate and display report
    report = await coordinator.generate_test_report(results) 
    logger.info("📊 Test Report Generated:")
    print(report)
    
    # Write report to file
    with open("/tmp/frontrow_e2e_test_report.md", "w") as f:
        f.write(report)
    
    logger.info("📁 Report saved to: /tmp/frontrow_e2e_test_report.md")

if __name__ == "__main__":
    asyncio.run(main())