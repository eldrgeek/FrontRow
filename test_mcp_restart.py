#!/usr/bin/env python3
"""
Test script for MCP server auto-restart functionality
"""

import time
import subprocess
import sys
from pathlib import Path

def test_mcp_restart():
    """Test the MCP server auto-restart functionality."""
    print("🧪 Testing MCP server auto-restart functionality...")
    print()
    
    # Start the development environment in full mode
    print("1️⃣ Starting development environment in full mode...")
    process = subprocess.Popen(
        ['python', 'start_dev.py', '--full'],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    # Wait for servers to start
    print("2️⃣ Waiting for servers to start up...")
    time.sleep(10)
    
    # Check if MCP server is running
    print("3️⃣ Checking if MCP server is running...")
    try:
        import requests
        response = requests.get('http://localhost:8001/health', timeout=5)
        if response.status_code == 200:
            print("✅ MCP server is running")
        else:
            print("❌ MCP server is not responding correctly")
            return False
    except Exception as e:
        print(f"❌ MCP server is not running: {e}")
        return False
    
    # Modify the MCP server file to trigger restart
    print("4️⃣ Modifying MCP server file to trigger restart...")
    mcp_file = Path('mcp_modal_server.py')
    
    # Read current content
    with open(mcp_file, 'r') as f:
        content = f.read()
    
    # Add a comment to trigger change
    modified_content = content + "\n# Test comment added at " + str(time.time()) + "\n"
    
    # Write modified content
    with open(mcp_file, 'w') as f:
        f.write(modified_content)
    
    print("✅ Modified MCP server file")
    
    # Wait for restart
    print("5️⃣ Waiting for MCP server to restart...")
    time.sleep(5)
    
    # Check if MCP server is still running after restart
    print("6️⃣ Checking if MCP server restarted successfully...")
    try:
        response = requests.get('http://localhost:8001/health', timeout=5)
        if response.status_code == 200:
            print("✅ MCP server restarted successfully")
        else:
            print("❌ MCP server failed to restart")
            return False
    except Exception as e:
        print(f"❌ MCP server is not running after restart: {e}")
        return False
    
    # Restore original content
    print("7️⃣ Restoring original MCP server file...")
    with open(mcp_file, 'w') as f:
        f.write(content)
    
    print("✅ Restored original MCP server file")
    
    # Stop the development environment
    print("8️⃣ Stopping development environment...")
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
    
    print("✅ Test completed successfully!")
    return True

if __name__ == "__main__":
    try:
        success = test_mcp_restart()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n🛑 Test interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Test failed: {e}")
        sys.exit(1) 