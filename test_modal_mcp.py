#!/usr/bin/env python3
"""
Test script for the FrontRow Modal MCP Server
============================================

This script demonstrates how to use the MCP server to control the modal dialog
for E2E testing scenarios.
"""

import asyncio
import aiohttp
import time
import json
from typing import Dict, Any

# MCP Server configuration
MCP_SERVER_URL = "http://localhost:8001"

async def test_mcp_modal_connection():
    """Test connection to the MCP server."""
    print("🔍 Testing MCP server connection...")
    
    async with aiohttp.ClientSession() as session:
        try:
            # Test health endpoint
            async with session.get(f"{MCP_SERVER_URL}/health") as response:
                if response.status == 200:
                    print("✅ MCP server is running")
                    return True
                else:
                    print(f"❌ MCP server returned status {response.status}")
                    return False
        except Exception as e:
            print(f"❌ Failed to connect to MCP server: {e}")
            return False

async def test_modal_operations():
    """Test various modal operations through the MCP server."""
    print("\n🧪 Testing modal operations...")
    
    async with aiohttp.ClientSession() as session:
        
        # Test 1: Connect to modal server
        print("\n1️⃣ Testing modal connection...")
        try:
            async with session.post(f"{MCP_SERVER_URL}/modal_connect", 
                                  json={"server_url": "http://localhost:3001"}) as response:
                if response.status == 200:
                    result = await response.json()
                    print(f"   ✅ Connection result: {result.get('success', False)}")
                else:
                    print(f"   ❌ Connection failed: {response.status}")
        except Exception as e:
            print(f"   ❌ Connection error: {e}")
        
        # Test 2: Show a simple message
        print("\n2️⃣ Testing message display...")
        try:
            message_data = {
                "message": "🖥️ Switching to Chrome on Desktop #2",
                "duration": 3000,
                "priority": "info",
                "icon": "desktop"
            }
            async with session.post(f"{MCP_SERVER_URL}/modal_show_message", 
                                  json=message_data) as response:
                if response.status == 200:
                    result = await response.json()
                    print(f"   ✅ Message sent: {result.get('success', False)}")
                else:
                    print(f"   ❌ Message failed: {response.status}")
        except Exception as e:
            print(f"   ❌ Message error: {e}")
        
        # Test 3: Progress bar
        print("\n3️⃣ Testing progress bar...")
        for progress in range(0, 101, 25):
            try:
                progress_data = {
                    "progress": progress,
                    "message": f"Running test scenario... {progress}%"
                }
                async with session.post(f"{MCP_SERVER_URL}/modal_progress", 
                                      json=progress_data) as response:
                    if response.status == 200:
                        result = await response.json()
                        print(f"   📈 Progress {progress}%: {result.get('success', False)}")
                    else:
                        print(f"   ❌ Progress failed: {response.status}")
            except Exception as e:
                print(f"   ❌ Progress error: {e}")
            
            await asyncio.sleep(0.5)
        
        # Test 4: Ask a question
        print("\n4️⃣ Testing question dialog...")
        try:
            question_data = {
                "question": "Should we continue with the test?",
                "options": ["Yes", "No", "Skip"]
            }
            async with session.post(f"{MCP_SERVER_URL}/modal_ask_question", 
                                  json=question_data) as response:
                if response.status == 200:
                    result = await response.json()
                    print(f"   ✅ Question sent: {result.get('success', False)}")
                else:
                    print(f"   ❌ Question failed: {response.status}")
        except Exception as e:
            print(f"   ❌ Question error: {e}")
        
        # Test 5: Hide modal
        print("\n5️⃣ Testing modal hide...")
        try:
            async with session.post(f"{MCP_SERVER_URL}/modal_hide") as response:
                if response.status == 200:
                    result = await response.json()
                    print(f"   ✅ Modal hidden: {result.get('success', False)}")
                else:
                    print(f"   ❌ Hide failed: {response.status}")
        except Exception as e:
            print(f"   ❌ Hide error: {e}")
        
        # Test 6: Get status
        print("\n6️⃣ Testing status check...")
        try:
            async with session.get(f"{MCP_SERVER_URL}/modal_status") as response:
                if response.status == 200:
                    result = await response.json()
                    print(f"   ✅ Status: {result.get('success', False)}")
                    if result.get('success'):
                        status = result.get('result', {})
                        print(f"      Connected: {status.get('connected', False)}")
                        print(f"      Server URL: {status.get('server_url', 'N/A')}")
                        print(f"      Messages sent: {status.get('last_message_id', 0)}")
                else:
                    print(f"   ❌ Status failed: {response.status}")
        except Exception as e:
            print(f"   ❌ Status error: {e}")

async def test_custom_actions():
    """Test custom actions through the MCP server."""
    print("\n🔧 Testing custom actions...")
    
    async with aiohttp.ClientSession() as session:
        
        # Test custom action
        try:
            custom_data = {
                "action": "custom_test",
                "message": "This is a custom test action",
                "data": {"test": True, "timestamp": time.time()}
            }
            async with session.post(f"{MCP_SERVER_URL}/modal_send_custom", 
                                  json=custom_data) as response:
                if response.status == 200:
                    result = await response.json()
                    print(f"   ✅ Custom action: {result.get('success', False)}")
                else:
                    print(f"   ❌ Custom action failed: {response.status}")
        except Exception as e:
            print(f"   ❌ Custom action error: {e}")

async def test_sequence():
    """Test a complete test sequence."""
    print("\n🎬 Testing complete sequence...")
    
    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(f"{MCP_SERVER_URL}/modal_test_sequence") as response:
                if response.status == 200:
                    result = await response.json()
                    print(f"   ✅ Test sequence: {result.get('success', False)}")
                    if result.get('success'):
                        test_results = result.get('results', [])
                        print(f"      Total messages: {len(test_results)}")
                        for i, test_result in enumerate(test_results[:3]):  # Show first 3
                            msg = test_result.get('message', 'Unknown')
                            success = test_result.get('result', {}).get('success', False)
                            print(f"      {i+1}. {msg}: {'✅' if success else '❌'}")
                        if len(test_results) > 3:
                            print(f"      ... and {len(test_results) - 3} more")
                else:
                    print(f"   ❌ Test sequence failed: {response.status}")
        except Exception as e:
            print(f"   ❌ Test sequence error: {e}")

async def main():
    """Main test function."""
    print("🚀 FrontRow Modal MCP Server Test")
    print("=" * 40)
    
    # Check if MCP server is running
    if not await test_mcp_modal_connection():
        print("\n❌ MCP server is not running!")
        print("   Start it with: ./start_modal_mcp.sh")
        return
    
    # Run tests
    await test_modal_operations()
    await test_custom_actions()
    await test_sequence()
    
    print("\n🎉 Test completed!")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Test interrupted by user")
    except Exception as e:
        print(f"\n❌ Test error: {e}") 