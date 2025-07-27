#!/usr/bin/env python3
"""
Test script for the FrontRow Modal App
Demonstrates sending various types of messages to the modal
"""

import asyncio
import aiohttp
import time

async def test_modal_messages():
    """Test various modal message types"""
    server_url = "http://localhost:3001"
    
    async with aiohttp.ClientSession() as session:
        print("🧪 Testing FrontRow Modal App...")
        
        # Test messages
        test_messages = [
            {
                "message": "🖥️ Switching to Chrome on Desktop #2",
                "duration": 2000,
                "priority": "info",
                "icon": "desktop"
            },
            {
                "message": "📑 Focusing on first tab",
                "duration": 1500,
                "priority": "info", 
                "icon": "tab"
            },
            {
                "message": "✍️ Entering user name: 'Alice'",
                "duration": 2000,
                "priority": "info",
                "icon": "type"
            },
            {
                "message": "📷 Taking profile picture...",
                "duration": 3000,
                "priority": "info",
                "icon": "camera"
            },
            {
                "message": "✅ Profile picture captured successfully!",
                "duration": 2000,
                "priority": "success",
                "icon": "check"
            },
            {
                "message": "🌐 Navigating to venue...",
                "duration": 1500,
                "priority": "info",
                "icon": "browser"
            },
            {
                "message": "👆 Selecting seat 3",
                "duration": 2000,
                "priority": "info",
                "icon": "click"
            },
            {
                "message": "✅ Seat 3 selected successfully!",
                "duration": 2000,
                "priority": "success",
                "icon": "check"
            }
        ]
        
        # Send each message with a delay
        for i, msg in enumerate(test_messages):
            print(f"📢 Sending: {msg['message']}")
            
            try:
                async with session.post(f"{server_url}/api/test/modal", json=msg) as response:
                    if response.status == 200:
                        result = await response.json()
                        print(f"   ✅ Sent successfully")
                    else:
                        print(f"   ❌ Failed: {response.status}")
            except Exception as e:
                print(f"   ❌ Error: {e}")
            
            # Wait for message to display
            await asyncio.sleep(msg['duration'] / 1000 + 0.5)
        
        # Test progress bar
        print("📊 Testing progress bar...")
        for progress in range(0, 101, 10):
            progress_msg = {
                "action": "progress",
                "message": f"Running test scenario... {progress}%",
                "progress": progress
            }
            
            try:
                async with session.post(f"{server_url}/api/test/modal", json=progress_msg) as response:
                    if response.status == 200:
                        print(f"   📈 Progress: {progress}%")
                    else:
                        print(f"   ❌ Progress failed: {response.status}")
            except Exception as e:
                print(f"   ❌ Progress error: {e}")
            
            await asyncio.sleep(0.3)
        
        # Final success message
        final_msg = {
            "message": "🎉 All tests completed successfully!",
            "duration": 5000,
            "priority": "success",
            "icon": "check"
        }
        
        try:
            async with session.post(f"{server_url}/api/test/modal", json=final_msg) as response:
                if response.status == 200:
                    print("🎉 Final message sent successfully!")
                else:
                    print(f"❌ Final message failed: {response.status}")
        except Exception as e:
            print(f"❌ Final message error: {e}")

if __name__ == "__main__":
    print("🚀 Starting FrontRow Modal Test")
    print("Make sure the modal app is running and connected to the server!")
    print("Press Ctrl+C to stop...")
    
    try:
        asyncio.run(test_modal_messages())
    except KeyboardInterrupt:
        print("\n👋 Test stopped by user")
    except Exception as e:
        print(f"❌ Test error: {e}") 