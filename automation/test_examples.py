#!/usr/bin/env python3
"""
Example test scenarios for FrontRow

These examples demonstrate how to use the test orchestrator for various scenarios.
"""

import asyncio
from frontrow_test_orchestrator import (
    FrontRowTestOrchestrator, 
    TestUser, 
    DEV_ENV, 
    PROD_ENV,
    test_frontrow
)


async def example_natural_language_tests():
    """Examples using natural language commands"""
    print("=== Natural Language Test Examples ===\n")
    
    # Test 1: Basic single user in Dev
    print("Test 1: Basic single user")
    result = await test_frontrow("Test the app with one audience member in Dev")
    print(result)
    
    # Test 2: Multiple users in Prod
    print("\nTest 2: Multiple users in production")
    result = await test_frontrow("Test with 3 audience members in Prod")
    print(result)
    
    # Test 3: Live stream test
    print("\nTest 3: Live stream scenario")
    result = await test_frontrow("Test with one audience member live stream")
    print(result)


async def example_component_tests():
    """Examples using individual components"""
    print("\n=== Component Test Examples ===\n")
    
    async with FrontRowTestOrchestrator(environment=DEV_ENV) as orchestrator:
        # Example 1: Manual user journey
        print("Example 1: Manual user journey")
        
        # Ensure Chrome is running
        if not orchestrator.ensure_chrome_debug():
            print("❌ Chrome debug not running")
            return
        
        # Reset server
        await orchestrator.reset_server()
        
        # Create a user
        user = TestUser("Alice", tab_index=0)
        
        # Execute steps individually
        await orchestrator.create_tab(orchestrator.env.frontend_url, user.tab_index)
        await orchestrator.navigate_to_app(user.tab_index)
        await orchestrator.login_user(user)
        await orchestrator.select_capture_mode(user)
        await orchestrator.select_seat_r3f(user, "seat-4")
        
        print(f"✅ User {user.name} journey completed, selected {user.seat_id}")
        
        # Example 2: Parallel multi-user test
        print("\n\nExample 2: Parallel multi-user test")
        
        users = [
            TestUser("Bob", 1),
            TestUser("Charlie", 2),
            TestUser("Diana", 3)
        ]
        
        # Run journeys in parallel
        results = await asyncio.gather(*[
            orchestrator.complete_user_journey(user) for user in users
        ])
        
        success_count = sum(1 for r in results if r)
        print(f"✅ {success_count}/{len(users)} users completed journey")
        
        # Example 3: Server state inspection
        print("\n\nExample 3: Server state inspection")
        
        state = await orchestrator.get_server_state()
        print(f"Connected users: {len(state.get('users', {}))}")
        print(f"Occupied seats: {state.get('seats', {}).get('occupiedCount', 0)}")
        print(f"Show status: {state.get('show', {}).get('status', 'unknown')}")


async def example_custom_scenario():
    """Example of a custom test scenario"""
    print("\n=== Custom Scenario Example ===\n")
    
    async with FrontRowTestOrchestrator(environment=DEV_ENV) as orchestrator:
        print("Running seat conflict test...")
        
        # Ensure Chrome
        if not orchestrator.ensure_chrome_debug():
            return
        
        # Reset
        await orchestrator.reset_server()
        
        # Create two users
        user1 = TestUser("First User", 0)
        user2 = TestUser("Second User", 1)
        
        # Both complete journey
        await orchestrator.complete_user_journey(user1)
        await orchestrator.complete_user_journey(user2)
        
        # Try to have both select same seat
        await orchestrator.select_seat_r3f(user1, "seat-4")
        await asyncio.sleep(1)
        
        result2 = await orchestrator.select_seat_r3f(user2, "seat-4")
        
        # Check server state
        state = await orchestrator.get_server_state()
        seat_4_occupant = state.get('seats', {}).get('occupied', {}).get('seat-4', {}).get('name')
        
        print(f"Seat 4 occupied by: {seat_4_occupant}")
        print(f"User 2 attempt result: {result2}")
        
        if seat_4_occupant == "First User":
            print("✅ Seat conflict handled correctly - first user kept seat")
        else:
            print("❌ Unexpected seat assignment")


async def example_diagnostic_test():
    """Example showing error diagnosis and recovery"""
    print("\n=== Diagnostic Test Example ===\n")
    
    async with FrontRowTestOrchestrator(environment=DEV_ENV) as orchestrator:
        print("Running diagnostic test...")
        
        # Check Chrome status
        chrome_ok = orchestrator.ensure_chrome_debug()
        print(f"Chrome debug status: {'✅ Running' if chrome_ok else '❌ Not running'}")
        
        if not chrome_ok:
            print("Attempting to launch Chrome...")
            orchestrator.ensure_chrome_debug()
        
        # Check server connectivity
        try:
            state = await orchestrator.get_server_state()
            print(f"Server status: ✅ Connected")
            print(f"Server environment: {orchestrator.env.name} ({orchestrator.env.backend_url})")
        except Exception as e:
            print(f"Server status: ❌ Error - {e}")
            print("Suggestion: Check if backend is running")
        
        # Check frontend accessibility
        try:
            await orchestrator.create_tab(orchestrator.env.frontend_url, 0)
            
            # Check for R3F scene
            result = await orchestrator.playwright_request("browser_evaluate", {
                "function": """() => {
                    return {
                        hasScene: !!window.__FRONTROW_SCENE__,
                        pageTitle: document.title,
                        isLoginPage: !!document.querySelector('input[placeholder="Your Name"]')
                    };
                }"""
            })
            
            print(f"Frontend status: ✅ Loaded")
            print(f"R3F Scene available: {'✅ Yes' if result.get('hasScene') else '❌ No'}")
            print(f"Page state: {'Login page' if result.get('isLoginPage') else 'Other'}")
            
        except Exception as e:
            print(f"Frontend status: ❌ Error - {e}")


if __name__ == "__main__":
    print("FrontRow Test Examples\n")
    print("Choose an example to run:")
    print("1. Natural language tests")
    print("2. Component tests")
    print("3. Custom scenario")
    print("4. Diagnostic test")
    print("5. Run all examples")
    
    choice = input("\nEnter choice (1-5): ").strip()
    
    if choice == "1":
        asyncio.run(example_natural_language_tests())
    elif choice == "2":
        asyncio.run(example_component_tests())
    elif choice == "3":
        asyncio.run(example_custom_scenario())
    elif choice == "4":
        asyncio.run(example_diagnostic_test())
    elif choice == "5":
        asyncio.run(example_natural_language_tests())
        asyncio.run(example_component_tests())
        asyncio.run(example_custom_scenario())
        asyncio.run(example_diagnostic_test())
    else:
        print("Invalid choice")