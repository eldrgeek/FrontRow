#!/usr/bin/env python3
"""
Interactive Testing Demo

This script demonstrates both automated and interactive testing modes:
1. Automated Mode: Script runs step-by-step with modal notifications
2. Interactive Mode: User manually confirms each step via the modal
"""

import asyncio
import uuid
from e2e_test_coordinator import FrontRowE2ETestCoordinator

async def demo_automated_mode():
    """Demonstrate automated testing mode"""
    print("🤖 Starting AUTOMATED MODE demo...")
    
    coordinator = FrontRowE2ETestCoordinator()
    
    # Step 1: Show automated step
    await coordinator.send_modal_message(
        "Starting automated test sequence...",
        duration=2000,
        priority="info",
        icon="robot"
    )
    await asyncio.sleep(2)
    
    # Step 2: Simulate automated actions
    steps = [
        ("Opening browser", "browser"),
        ("Navigating to FrontRow", "navigation"),
        ("Selecting seat A1", "seat"),
        ("Entering user name", "user"),
        ("Taking photo", "camera"),
        ("Joining show", "show")
    ]
    
    for i, (step_name, icon) in enumerate(steps):
        progress = int((i + 1) / len(steps) * 100)
        
        await coordinator.send_modal_progress(progress, f"Automated: {step_name}")
        await asyncio.sleep(1.5)
    
    await coordinator.send_modal_message(
        "Automated test completed successfully!",
        duration=3000,
        priority="success",
        icon="check"
    )

async def demo_interactive_mode():
    """Demonstrate interactive testing mode"""
    print("👤 Starting INTERACTIVE MODE demo...")
    
    coordinator = FrontRowE2ETestCoordinator()
    
    # Step 1: Show interactive mode start
    await coordinator.send_modal_message(
        "Starting interactive test mode - please confirm each step",
        duration=3000,
        priority="info",
        icon="user"
    )
    await asyncio.sleep(3)
    
    # Step 2: Interactive test steps
    interactive_steps = [
        {
            "message": "Please open Chrome and navigate to FrontRow",
            "step": "browser_navigation",
            "icon": "browser"
        },
        {
            "message": "Select seat A1 in the front row",
            "step": "seat_selection", 
            "icon": "seat"
        },
        {
            "message": "Enter your name in the form",
            "step": "user_input",
            "icon": "user"
        },
        {
            "message": "Take a photo using the camera",
            "step": "photo_capture",
            "icon": "camera"
        },
        {
            "message": "Join the live show",
            "step": "join_show",
            "icon": "show"
        }
    ]
    
    for i, step_data in enumerate(interactive_steps):
        test_id = f"interactive_{uuid.uuid4().hex[:8]}"
        
        print(f"\n📋 Step {i+1}: {step_data['step']}")
        print(f"   Message: {step_data['message']}")
        
        # Send interactive step and wait for response
        response = await coordinator.send_interactive_step(
            message=step_data['message'],
            test_step=step_data['step'],
            test_id=test_id,
            icon=step_data['icon']
        )
        
        print(f"   User response: {response.get('response', 'unknown')}")
        
        # Handle user response
        if response.get('response') == 'stop':
            print("🛑 Test stopped by user")
            break
        elif response.get('response') == 'failure':
            print("❌ Step failed - continuing to next step")
        elif response.get('response') == 'success':
            print("✅ Step completed successfully")
        elif response.get('response') == 'timeout':
            print("⏰ Step timed out - continuing to next step")
        
        await asyncio.sleep(1)
    
    # Final message
    await coordinator.send_modal_message(
        "Interactive test mode completed!",
        duration=3000,
        priority="success",
        icon="check"
    )

async def main():
    """Run both demo modes"""
    print("🎭 FrontRow Interactive Testing Demo")
    print("=" * 50)
    
    try:
        # Demo automated mode
        await demo_automated_mode()
        
        print("\n" + "=" * 50)
        print("Press Enter to continue to interactive mode...")
        input()
        
        # Demo interactive mode
        await demo_interactive_mode()
        
    except Exception as e:
        print(f"❌ Demo failed: {e}")
        # Create coordinator for error message
        try:
            coordinator = FrontRowE2ETestCoordinator()
            await coordinator.send_modal_message(
                f"Demo failed: {e}",
                duration=5000,
                priority="error",
                icon="error"
            )
        except:
            print("Could not send error message to modal")

if __name__ == "__main__":
    asyncio.run(main()) 