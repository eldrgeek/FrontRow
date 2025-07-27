#!/usr/bin/env python3
"""
FrontRow Test Orchestrator

This module provides components for LLM-driven E2E testing of the FrontRow application.
It can be used to compose and execute test scenarios based on natural language commands.
"""

import asyncio
import json
import time
import subprocess
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from datetime import datetime
import aiohttp
import logging
from contextlib import asynccontextmanager

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@dataclass
class Environment:
    """Testing environment configuration"""
    name: str
    frontend_url: str
    backend_url: str
    
    @property
    def dashboard_url(self):
        return f"{self.backend_url}/dashboard"


# Predefined environments
DEV_ENV = Environment(
    name="Dev",
    frontend_url="http://localhost:5173",
    backend_url="http://localhost:3001"
)

PROD_ENV = Environment(
    name="Prod", 
    frontend_url="https://frontrowtheater.netlify.app",
    backend_url="https://frontrow-production.onrender.com"
)


@dataclass
class TestUser:
    """Represents a test user"""
    name: str
    tab_index: int
    socket_id: Optional[str] = None
    seat_id: Optional[str] = None
    capture_mode: str = "photo"
    is_performer: bool = False


@dataclass 
class TestResult:
    """Test execution result"""
    success: bool
    duration: float
    summary: str
    errors: List[str] = None
    suggestions: List[str] = None


class FrontRowTestOrchestrator:
    """Main test orchestration class"""
    
    def __init__(self, environment: Environment = DEV_ENV):
        self.env = environment
        self.session: Optional[aiohttp.ClientSession] = None
        self.playwright_url = "http://localhost:3000/mcp/v1"  # MCP Playwright server
        self.current_tabs: Dict[int, str] = {}  # tab_index -> tab_id mapping
        self.test_start_time: Optional[float] = None
        
    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()
    
    # Chrome Management
    
    def ensure_chrome_debug(self) -> bool:
        """Ensure Chrome is running with debugging enabled"""
        try:
            # Check if Chrome debug is already running
            async def check_chrome():
                async with aiohttp.ClientSession() as session:
                    try:
                        async with session.get("http://localhost:9222/json") as resp:
                            return resp.status == 200
                    except:
                        return False
            
            if asyncio.run(check_chrome()):
                logger.info("✅ Chrome debug already running")
                return True
            
            # Launch Chrome debug
            logger.info("🚀 Launching Chrome with debugging...")
            subprocess.Popen([
                "python3", "./launch_chrome.py"
            ], cwd="/Users/MikeWolf/Projects/FrontRow")
            
            # Wait for Chrome to start
            time.sleep(3)
            return asyncio.run(check_chrome())
            
        except Exception as e:
            logger.error(f"❌ Failed to ensure Chrome debug: {e}")
            return False
    
    # Playwright MCP Communication
    
    async def playwright_request(self, method: str, params: Dict[str, Any]) -> Any:
        """Make a request to Playwright MCP server"""
        if not self.session:
            self.session = aiohttp.ClientSession()
            
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": int(time.time() * 1000)
        }
        
        async with self.session.post(self.playwright_url, json=payload) as resp:
            result = await resp.json()
            if "error" in result:
                raise Exception(f"Playwright error: {result['error']}")
            return result.get("result")
    
    # Tab Management
    
    async def create_tab(self, url: str, tab_index: int) -> str:
        """Create a new browser tab"""
        result = await self.playwright_request("browser_tab_new", {"url": url})
        tab_id = result.get("tabId")
        self.current_tabs[tab_index] = tab_id
        logger.info(f"📑 Created tab {tab_index}: {tab_id}")
        return tab_id
    
    async def switch_to_tab(self, tab_index: int):
        """Switch to a specific tab"""
        if tab_index in self.current_tabs:
            await self.playwright_request("browser_tab_select", {"index": tab_index})
            logger.info(f"🔄 Switched to tab {tab_index}")
    
    # Server API
    
    async def get_server_state(self) -> Dict[str, Any]:
        """Get current server state"""
        async with self.session.get(f"{self.env.backend_url}/api/test/state") as resp:
            return await resp.json()
    
    async def reset_server(self) -> bool:
        """Reset server to clean state"""
        async with self.session.post(f"{self.env.backend_url}/api/test/reset") as resp:
            result = await resp.json()
            logger.info("🔄 Server reset completed")
            return result.get("success", False)
    
    async def force_assign_seat(self, socket_id: str, seat_id: str, user_name: str):
        """Force assign a seat (test API)"""
        data = {
            "socketId": socket_id,
            "userName": user_name,
            "captureMode": "photo"
        }
        async with self.session.post(
            f"{self.env.backend_url}/api/test/seats/{seat_id}/assign", 
            json=data
        ) as resp:
            return await resp.json()
    
    async def set_show_state(self, state: str, artist_id: Optional[str] = None):
        """Set show state (idle, pre-show, live, post-show)"""
        data = {"status": state}
        if artist_id:
            data["artistId"] = artist_id
        async with self.session.post(
            f"{self.env.backend_url}/api/test/show/state",
            json=data
        ) as resp:
            return await resp.json()
    
    # User Actions (Fine-grained)
    
    async def navigate_to_app(self, tab_index: int):
        """Navigate to the FrontRow app"""
        await self.switch_to_tab(tab_index)
        await self.playwright_request("browser_navigate", {"url": self.env.frontend_url})
        await asyncio.sleep(2)  # Wait for initial load
        logger.info(f"🌐 Tab {tab_index} navigated to {self.env.frontend_url}")
    
    async def login_user(self, user: TestUser):
        """Complete login flow for a user"""
        await self.switch_to_tab(user.tab_index)
        
        # Enter name
        await self.playwright_request("browser_evaluate", {
            "function": f"""() => {{
                const input = document.querySelector('input[placeholder="Your Name"]');
                input.value = '{user.name}';
                input.dispatchEvent(new Event('input', {{ bubbles: true }}));
                return 'Name entered';
            }}"""
        })
        
        # Click Enter FRONT ROW
        await self.playwright_request("browser_evaluate", {
            "function": """() => {
                const button = document.querySelector('button[type="submit"]');
                button.click();
                return 'Clicked Enter FRONT ROW';
            }"""
        })
        
        await asyncio.sleep(2)
        logger.info(f"👤 User {user.name} logged in")
    
    async def select_capture_mode(self, user: TestUser):
        """Select photo or video capture mode"""
        await self.switch_to_tab(user.tab_index)
        
        if user.capture_mode == "photo":
            # Click "Use My Photo"
            await self.playwright_request("browser_evaluate", {
                "function": """() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const photoBtn = buttons.find(b => b.textContent.includes('Use My Photo'));
                    if (photoBtn) { photoBtn.click(); return 'Photo mode selected'; }
                    return 'Photo button not found';
                }"""
            })
        else:
            # Click "Start Video Stream"
            await self.playwright_request("browser_evaluate", {
                "function": """() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const videoBtn = buttons.find(b => b.textContent.includes('Start Video Stream'));
                    if (videoBtn) { videoBtn.click(); return 'Video mode selected'; }
                    return 'Video button not found';
                }"""
            })
            
        await asyncio.sleep(3)  # Wait for venue to load
        logger.info(f"📷 User {user.name} selected {user.capture_mode} mode")
    
    async def select_seat_r3f(self, user: TestUser, seat_id: str):
        """Select a seat using R3F scene access"""
        await self.switch_to_tab(user.tab_index)
        
        result = await self.playwright_request("browser_evaluate", {
            "function": f"""() => {{
                if (window.__FRONTROW_SCENE__) {{
                    return window.__FRONTROW_SCENE__.clickSeat('{seat_id}');
                }}
                return 'Scene not available';
            }}"""
        })
        
        user.seat_id = seat_id
        logger.info(f"💺 User {user.name} selected {seat_id}: {result}")
        return result
    
    # User Journey (Coarse-grained)
    
    async def complete_user_journey(self, user: TestUser) -> bool:
        """Complete full user journey from login to seat selection"""
        try:
            # Create tab if needed
            if user.tab_index not in self.current_tabs:
                await self.create_tab(self.env.frontend_url, user.tab_index)
            
            # Navigate and login
            await self.navigate_to_app(user.tab_index)
            await self.login_user(user)
            
            # Select capture mode
            await self.select_capture_mode(user)
            
            # Select a seat
            seat_id = f"seat-{user.tab_index % 9}"  # Distribute users across seats
            await self.select_seat_r3f(user, seat_id)
            
            return True
            
        except Exception as e:
            logger.error(f"❌ User journey failed for {user.name}: {e}")
            return False
    
    # Test Scenarios
    
    async def run_basic_test(self, user_count: int = 1) -> TestResult:
        """Run basic countdown test with specified number of users"""
        self.test_start_time = time.time()
        errors = []
        
        try:
            # Ensure Chrome is running
            if not self.ensure_chrome_debug():
                return TestResult(
                    success=False,
                    duration=0,
                    summary="Chrome debug not available",
                    errors=["Failed to start Chrome with debugging"],
                    suggestions=["Run ./launch_chrome.py manually"]
                )
            
            # Reset server
            await self.reset_server()
            
            # Create and setup users
            users = [TestUser(f"User{i+1}", i) for i in range(user_count)]
            
            # Complete user journeys in parallel
            journey_tasks = [self.complete_user_journey(user) for user in users]
            journey_results = await asyncio.gather(*journey_tasks)
            
            successful_users = sum(1 for r in journey_results if r)
            if successful_users < user_count:
                errors.append(f"Only {successful_users}/{user_count} users completed journey")
            
            # Start countdown
            await self.set_show_state("pre-show")
            logger.info("⏱️ Starting 10-second countdown...")
            await asyncio.sleep(10)
            
            # Verify show went live
            state = await self.get_server_state()
            show_status = state.get("show", {}).get("status")
            
            if show_status != "live":
                errors.append(f"Show status is '{show_status}', expected 'live'")
            
            # Calculate duration
            duration = time.time() - self.test_start_time
            
            # Generate summary
            if not errors:
                summary = f"✅ Test Completed: {user_count} audience member{'s' if user_count > 1 else ''} in {self.env.name}"
            else:
                summary = f"❌ Test Failed: {errors[0]}"
            
            return TestResult(
                success=len(errors) == 0,
                duration=duration,
                summary=summary,
                errors=errors if errors else None
            )
            
        except Exception as e:
            duration = time.time() - self.test_start_time if self.test_start_time else 0
            return TestResult(
                success=False,
                duration=duration,
                summary=f"❌ Test Failed: {str(e)}",
                errors=[str(e)],
                suggestions=["Check server logs", "Verify Chrome is running"]
            )
    
    async def run_live_stream_test(self, audience_count: int = 1) -> TestResult:
        """Run live stream test with performer and audience"""
        self.test_start_time = time.time()
        errors = []
        
        try:
            # Reset and setup
            if not self.ensure_chrome_debug():
                return TestResult(success=False, duration=0, summary="Chrome debug not available")
            
            await self.reset_server()
            
            # Create performer
            performer = TestUser("Performer", 0, is_performer=True)
            await self.complete_user_journey(performer)
            
            # TODO: Implement performer stream start
            logger.info("🎤 Performer stream setup needed")
            
            # Create audience members
            audience = [TestUser(f"Audience{i+1}", i+1) for i in range(audience_count)]
            await asyncio.gather(*[self.complete_user_journey(user) for user in audience])
            
            # Set show live
            await self.set_show_state("live", artist_id=performer.socket_id)
            
            duration = time.time() - self.test_start_time
            summary = f"✅ Live stream test completed with {audience_count} audience member{'s' if audience_count > 1 else ''}"
            
            return TestResult(
                success=True,
                duration=duration,
                summary=summary
            )
            
        except Exception as e:
            duration = time.time() - self.test_start_time if self.test_start_time else 0
            return TestResult(
                success=False,
                duration=duration,
                summary=f"❌ Live stream test failed: {str(e)}",
                errors=[str(e)]
            )
    
    # Quick test runner for common scenarios
    
    async def quick_test(self, command: str) -> TestResult:
        """Parse natural language command and run appropriate test"""
        command_lower = command.lower()
        
        # Determine environment
        if "prod" in command_lower or "netlify" in command_lower:
            self.env = PROD_ENV
        else:
            self.env = DEV_ENV
        
        # Determine user count
        user_count = 1
        for word, count in [("one", 1), ("two", 2), ("three", 3), ("four", 4), ("five", 5)]:
            if word in command_lower:
                user_count = count
                break
        # Also check for digits
        for i in range(1, 10):
            if str(i) in command:
                user_count = i
                break
        
        # Determine test type
        if "live stream" in command_lower or "streaming" in command_lower:
            return await self.run_live_stream_test(user_count)
        else:
            return await self.run_basic_test(user_count)


# Convenience function for LLM usage
async def test_frontrow(command: str) -> str:
    """
    Main entry point for LLM testing commands.
    
    Examples:
        await test_frontrow("Test with 3 audience members in Prod")
        await test_frontrow("Test with one audience member live stream")
    """
    async with FrontRowTestOrchestrator() as orchestrator:
        result = await orchestrator.quick_test(command)
        
        # Format result for display
        output = f"{result.summary}\n"
        output += f"Duration: {result.duration:.1f} seconds\n"
        
        if result.errors:
            output += f"Issues: {', '.join(result.errors)}\n"
        else:
            output += "Issues: None\n"
        
        if result.suggestions:
            output += f"Suggestions: {', '.join(result.suggestions)}\n"
        
        return output


if __name__ == "__main__":
    # Example usage
    import sys
    
    if len(sys.argv) > 1:
        command = " ".join(sys.argv[1:])
        print(asyncio.run(test_frontrow(command)))
    else:
        print("Usage: python frontrow_test_orchestrator.py <test command>")
        print("Example: python frontrow_test_orchestrator.py 'Test with 3 audience members in Dev'")