#!/usr/bin/env python3
"""
LLM/Playwright Integration Example

This script shows how an LLM or Playwright automation script can use
the interactive testing system to get user confirmation for critical steps.
"""

import asyncio
import uuid
from e2e_test_coordinator import FrontRowE2ETestCoordinator

class LLMTestRunner:
    def __init__(self):
        self.coordinator = FrontRowE2ETestCoordinator()
        self.test_id = f"llm_test_{uuid.uuid4().hex[:8]}"
    
    async def run_automated_step(self, description: str, action_func):
        """Run an automated step with modal notification"""
        await self.coordinator.send_modal_message(
            f"🤖 Automated: {description}",
            duration=2000,
            priority="info",
            icon="robot"
        )
        
        # Execute the action (e.g., Playwright command)
        result = await action_func()
        
        await self.coordinator.send_modal_message(
            f"✅ Completed: {description}",
            duration=1500,
            priority="success",
            icon="check"
        )
        
        return result
    
    async def run_interactive_step(self, description: str, instruction: str):
        """Run an interactive step requiring user confirmation"""
        step_id = f"{self.test_id}_{uuid.uuid4().hex[:8]}"
        
        response = await self.coordinator.send_interactive_step(
            message=instruction,
            test_step=description,
            test_id=step_id,
            icon="user"
        )
        
        return response.get('response')
    
    async def run_frontrow_test_scenario(self):
        """Example FrontRow test scenario mixing automated and interactive steps"""
        
        # Start test
        await self.coordinator.send_modal_message(
            "🎭 Starting FrontRow LLM Test Scenario",
            duration=3000,
            priority="info",
            icon="show"
        )
        
        # Automated: Open browser
        await self.run_automated_step(
            "Opening Chrome browser",
            lambda: asyncio.sleep(1)  # Simulate Playwright action
        )
        
        # Automated: Navigate to FrontRow
        await self.run_automated_step(
            "Navigating to FrontRow application",
            lambda: asyncio.sleep(1)  # Simulate Playwright action
        )
        
        # Interactive: Verify page loaded correctly
        result = await self.run_interactive_step(
            "page_verification",
            "Please confirm the FrontRow page loaded correctly with the stage and seats visible"
        )
        
        if result == 'failure':
            await self.coordinator.send_modal_message(
                "❌ Page verification failed - stopping test",
                duration=3000,
                priority="error",
                icon="error"
            )
            return False
        
        # Automated: Click on seat A1
        await self.run_automated_step(
            "Selecting seat A1",
            lambda: asyncio.sleep(1)  # Simulate Playwright action
        )
        
        # Interactive: Confirm seat selection
        result = await self.run_interactive_step(
            "seat_confirmation",
            "Please confirm that seat A1 is now highlighted/selected"
        )
        
        if result == 'failure':
            await self.coordinator.send_modal_message(
                "❌ Seat selection failed - stopping test",
                duration=3000,
                priority="error",
                icon="error"
            )
            return False
        
        # Automated: Fill name form
        await self.run_automated_step(
            "Entering user name 'Test User'",
            lambda: asyncio.sleep(1)  # Simulate Playwright action
        )
        
        # Interactive: Verify name entered
        result = await self.run_interactive_step(
            "name_verification",
            "Please confirm that 'Test User' appears in the name field"
        )
        
        if result == 'failure':
            await self.coordinator.send_modal_message(
                "❌ Name entry failed - stopping test",
                duration=3000,
                priority="error",
                icon="error"
            )
            return False
        
        # Automated: Take photo
        await self.run_automated_step(
            "Taking user photo",
            lambda: asyncio.sleep(1)  # Simulate Playwright action
        )
        
        # Interactive: Confirm photo taken
        result = await self.run_interactive_step(
            "photo_verification",
            "Please confirm that a photo was captured and displayed"
        )
        
        if result == 'failure':
            await self.coordinator.send_modal_message(
                "❌ Photo capture failed - stopping test",
                duration=3000,
                priority="error",
                icon="error"
            )
            return False
        
        # Automated: Join show
        await self.run_automated_step(
            "Joining the live show",
            lambda: asyncio.sleep(1)  # Simulate Playwright action
        )
        
        # Interactive: Final verification
        result = await self.run_interactive_step(
            "show_verification",
            "Please confirm you can see the live show with the user seated in A1"
        )
        
        if result == 'success':
            await self.coordinator.send_modal_message(
                "🎉 FrontRow test completed successfully!",
                duration=5000,
                priority="success",
                icon="check"
            )
            return True
        else:
            await self.coordinator.send_modal_message(
                "❌ Final verification failed",
                duration=3000,
                priority="error",
                icon="error"
            )
            return False

async def main():
    """Run the LLM test scenario"""
    print("🤖 LLM/Playwright Integration Test")
    print("=" * 50)
    
    runner = LLMTestRunner()
    
    try:
        success = await runner.run_frontrow_test_scenario()
        
        if success:
            print("✅ Test scenario completed successfully!")
        else:
            print("❌ Test scenario failed")
            
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        await runner.coordinator.send_modal_message(
            f"Test failed: {e}",
            duration=5000,
            priority="error",
            icon="error"
        )

if __name__ == "__main__":
    asyncio.run(main()) 