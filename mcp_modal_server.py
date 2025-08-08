#!/usr/bin/env python3
"""
MCP Server for FrontRow Modal App Control
=========================================

This MCP server provides tools to control the FrontRow modal dialog application
for E2E testing coordination. It can send messages to the modal, control its
appearance, and coordinate with test scripts.

Features:
- Send test messages to modal dialog
- Control modal visibility (show/hide)
- Set modal position and styling
- Progress bar updates
- Question/response handling
- WebSocket communication with modal app

Usage:
1. Install dependencies: pip install fastmcp uvicorn aiohttp websockets
2. Run server: python mcp_modal_server.py
3. Add to Cursor settings for MCP integration
"""

import os
import json
import asyncio
import aiohttp
import websockets
import argparse
import sys
import signal
import atexit
from pathlib import Path
from typing import List, Dict, Any, Optional, Union
import time
import threading
from datetime import datetime
import uuid
import logging
from contextlib import asynccontextmanager

# FastMCP import
from fastmcp import FastMCP

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.expanduser('~/mcp_modal_server.log')),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

# Configuration
SERVER_PORT = 8001
SERVER_HOST = "127.0.0.1"
SERVER_VERSION = "1.0.0"
MODAL_SERVER_URL = "http://localhost:3001"  # Default modal server URL

# Initialize FastMCP server
mcp = FastMCP("FrontRow Modal Controller v1.0")

# Global state
modal_connections = {}
active_messages = {}
message_queue = []

class ModalController:
    """Controller for the FrontRow modal app."""
    
    def __init__(self, server_url: str = MODAL_SERVER_URL):
        self.server_url = server_url
        self.session = None
        self.connected = False
        self.last_message_id = 0
        
    async def connect(self) -> bool:
        """Connect to the modal server."""
        try:
            if self.session is None:
                self.session = aiohttp.ClientSession()
            
            # Test connection
            async with self.session.get(f"{self.server_url}/health") as response:
                if response.status == 200:
                    self.connected = True
                    logger.info(f"Connected to modal server at {self.server_url}")
                    return True
                else:
                    logger.error(f"Modal server returned status {response.status}")
                    return False
                    
        except Exception as e:
            logger.error(f"Failed to connect to modal server: {e}")
            return False
    
    async def disconnect(self):
        """Disconnect from the modal server."""
        if self.session:
            await self.session.close()
            self.session = None
        self.connected = False
        logger.info("Disconnected from modal server")
    
    async def send_message(self, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """Send a message to the modal."""
        if not self.connected:
            await self.connect()
        
        try:
            self.last_message_id += 1
            message_id = self.last_message_id
            
            # Add metadata
            message_data.update({
                "id": message_id,
                "timestamp": datetime.now().isoformat(),
                "source": "mcp_modal_server"
            })
            
            async with self.session.post(
                f"{self.server_url}/api/test/modal",
                json=message_data
            ) as response:
                
                if response.status == 200:
                    result = await response.json()
                    logger.info(f"Message {message_id} sent successfully")
                    return {
                        "success": True,
                        "message_id": message_id,
                        "result": result,
                        "timestamp": datetime.now().isoformat()
                    }
                else:
                    error_text = await response.text()
                    logger.error(f"Modal server error: {response.status} - {error_text}")
                    return {
                        "success": False,
                        "error": f"Server returned {response.status}",
                        "details": error_text
                    }
                    
        except Exception as e:
            logger.error(f"Error sending message to modal: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def show_modal(self, message: str, duration: int = 3000, 
                        priority: str = "info", icon: str = None) -> Dict[str, Any]:
        """Show the modal with a message."""
        message_data = {
            "action": "show",
            "message": message,
            "duration": duration,
            "priority": priority
        }
        
        if icon:
            message_data["icon"] = icon
            
        return await self.send_message(message_data)
    
    async def hide_modal(self) -> Dict[str, Any]:
        """Hide the modal."""
        message_data = {
            "action": "hide"
        }
        return await self.send_message(message_data)
    
    async def update_progress(self, progress: int, message: str = None) -> Dict[str, Any]:
        """Update progress bar in modal."""
        message_data = {
            "action": "progress",
            "progress": progress
        }
        
        if message:
            message_data["message"] = message
            
        return await self.send_message(message_data)
    
    async def ask_question(self, question: str, options: List[str] = None) -> Dict[str, Any]:
        """Ask a question through the modal."""
        message_data = {
            "action": "question",
            "question": question
        }
        
        if options:
            message_data["options"] = options
            
        return await self.send_message(message_data)

# Global modal controller
modal_controller = ModalController()

# Resource cleanup
def cleanup_resources():
    """Clean up resources on server shutdown."""
    logger.info("Cleaning up modal server resources...")
    
    # Disconnect from modal server
    if modal_controller.connected:
        asyncio.create_task(modal_controller.disconnect())
    
    logger.info("Resource cleanup completed")

# Register cleanup handlers
atexit.register(cleanup_resources)
signal.signal(signal.SIGINT, lambda s, f: cleanup_resources())
signal.signal(signal.SIGTERM, lambda s, f: cleanup_resources())

# ============================================================================
# MCP TOOLS FOR MODAL CONTROL
# ============================================================================

@mcp.tool()
def modal_connect(server_url: str = MODAL_SERVER_URL) -> Dict[str, Any]:
    """
    Connect to the modal server.
    
    Args:
        server_url: URL of the modal server
        
    Returns:
        Connection status
    """
    try:
        import requests
        
        # Test connection by making a simple request
        response = requests.get(f"{server_url}/health", timeout=5)
        
        if response.status_code == 200:
            return {
                "success": True,
                "server_url": server_url,
                "connected": True,
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "success": False,
                "error": f"Server returned {response.status_code}",
                "server_url": server_url,
                "connected": False,
                "timestamp": datetime.now().isoformat()
            }
            
    except Exception as e:
        logger.error(f"Connection error: {e}")
        return {
            "success": False,
            "error": str(e),
            "server_url": server_url,
            "connected": False,
            "timestamp": datetime.now().isoformat()
        }

@mcp.tool()
def modal_show_message(
    message: str,
    duration: int = 3000,
    priority: str = "info",
    icon: str = None
) -> Dict[str, Any]:
    """
    Show a message in the modal dialog.
    
    Args:
        message: Message to display
        duration: How long to show the message (ms)
        priority: Message priority (info, success, warning, error)
        icon: Icon to display with message
        
    Returns:
        Message send status
    """
    try:
        import requests
        
        # Prepare message data
        message_data = {
            "action": "show",
            "message": message,
            "duration": duration,
            "priority": priority,
            "timestamp": datetime.now().isoformat()
        }
        
        if icon:
            message_data["icon"] = icon
        
        # Send HTTP request directly
        response = requests.post(
            f"{MODAL_SERVER_URL}/api/test/modal",
            json=message_data,
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            return {
                "success": True,
                "message": message,
                "result": result,
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "success": False,
                "error": f"Server returned {response.status_code}",
                "message": message,
                "details": response.text
            }
            
    except Exception as e:
        logger.error(f"Error showing message: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": message
        }

@mcp.tool()
def modal_hide() -> Dict[str, Any]:
    """
    Hide the modal dialog.
    
    Returns:
        Hide operation status
    """
    try:
        import requests
        
        # Prepare hide message data
        message_data = {
            "action": "hide",
            "message": "Hiding modal",
            "timestamp": datetime.now().isoformat()
        }
        
        # Send HTTP request directly
        response = requests.post(
            f"{MODAL_SERVER_URL}/api/test/modal",
            json=message_data,
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            return {
                "success": True,
                "result": result,
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "success": False,
                "error": f"Server returned {response.status_code}",
                "details": response.text
            }
            
    except Exception as e:
        logger.error(f"Error hiding modal: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@mcp.tool()
def modal_progress(progress: int, message: str = None) -> Dict[str, Any]:
    """
    Update progress bar in modal.
    
    Args:
        progress: Progress percentage (0-100)
        message: Optional message to display
        
    Returns:
        Progress update status
    """
    try:
        import requests
        
        # Prepare progress message data
        message_data = {
            "action": "progress",
            "progress": progress,
            "timestamp": datetime.now().isoformat()
        }
        
        if message:
            message_data["message"] = message
        
        # Send HTTP request directly
        response = requests.post(
            f"{MODAL_SERVER_URL}/api/test/modal",
            json=message_data,
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            return {
                "success": True,
                "progress": progress,
                "result": result,
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "success": False,
                "error": f"Server returned {response.status_code}",
                "progress": progress,
                "details": response.text
            }
            
    except Exception as e:
        logger.error(f"Error updating progress: {e}")
        return {
            "success": False,
            "error": str(e),
            "progress": progress
        }

@mcp.tool()
def modal_ask_question(question: str, options: List[str] = None) -> Dict[str, Any]:
    """
    Ask a question through the modal.
    
    Args:
        question: Question to ask
        options: Optional list of answer options
        
    Returns:
        Question status
    """
    try:
        import requests
        
        # Prepare question data
        question_data = {
            "action": "question",
            "message": question,
            "question": question,
            "timestamp": datetime.now().isoformat()
        }
        
        if options:
            question_data["options"] = options
        
        # Send HTTP request directly
        response = requests.post(
            f"{MODAL_SERVER_URL}/api/test/modal",
            json=question_data,
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            return {
                "success": True,
                "question": question,
                "options": options,
                "result": result,
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "success": False,
                "error": f"Server returned {response.status_code}",
                "question": question,
                "details": response.text
            }
            
    except Exception as e:
        logger.error(f"Error asking question: {e}")
        return {
            "success": False,
            "error": str(e),
            "question": question
        }

@mcp.tool()
def modal_send_custom(action: str, data: str = None) -> Dict[str, Any]:
    """
    Send a custom action to the modal.
    
    Args:
        action: Action to perform
        data: Additional data as JSON string
        
    Returns:
        Custom action status
    """
    try:
        import requests
        
        # Prepare custom action data
        message_data = {"action": action}
        if data:
            try:
                import json
                additional_data = json.loads(data)
                message_data.update(additional_data)
            except json.JSONDecodeError:
                message_data["data"] = data
        
        # Send HTTP request directly
        response = requests.post(
            f"{MODAL_SERVER_URL}/api/test/modal",
            json=message_data,
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            return {
                "success": True,
                "action": action,
                "data": data,
                "result": result,
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "success": False,
                "error": f"Server returned {response.status_code}",
                "action": action,
                "details": response.text
            }
            
    except Exception as e:
        logger.error(f"Error sending custom action: {e}")
        return {
            "success": False,
            "error": str(e),
            "action": action
        }

@mcp.tool()
def modal_status() -> Dict[str, Any]:
    """
    Get the current status of the modal server.
    
    Returns:
        Modal server status information
    """
    try:
        return {
            "success": True,
            "server_url": modal_controller.server_url,
            "connected": modal_controller.connected,
            "last_message_id": modal_controller.last_message_id,
            "server_version": SERVER_VERSION,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

@mcp.tool()
def modal_test_sequence() -> Dict[str, Any]:
    """
    Run a test sequence to verify modal functionality.
    
    Returns:
        Test sequence results
    """
    try:
        import requests
        
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
            }
        ]
        
        results = []
        
        for i, msg in enumerate(test_messages):
            logger.info(f"Testing message {i+1}: {msg['message']}")
            
            message_data = {
                "action": "show",
                "message": msg["message"],
                "duration": msg["duration"],
                "priority": msg["priority"],
                "timestamp": datetime.now().isoformat()
            }
            
            if msg.get("icon"):
                message_data["icon"] = msg["icon"]
            
            response = requests.post(
                f"{MODAL_SERVER_URL}/api/test/modal",
                json=message_data,
                timeout=10
            )
            
            result = {"status_code": response.status_code, "response": response.text}
            results.append({
                "message_number": i + 1,
                "message": msg["message"],
                "result": result
            })
            
            # Wait for message to display
            time.sleep(msg["duration"] / 1000 + 0.5)
        
        # Test progress bar
        logger.info("Testing progress bar...")
        for progress in range(0, 101, 20):
            progress_data = {
                "action": "progress",
                "progress": progress,
                "message": f"Running test scenario... {progress}%",
                "timestamp": datetime.now().isoformat()
            }
            
            response = requests.post(
                f"{MODAL_SERVER_URL}/api/test/modal",
                json=progress_data,
                timeout=10
            )
            
            progress_result = {"status_code": response.status_code, "response": response.text}
            results.append({
                "message_number": len(results) + 1,
                "message": f"Progress: {progress}%",
                "result": progress_result
            })
            time.sleep(0.3)
        
        # Final success message
        final_data = {
            "action": "show",
            "message": "🎉 All tests completed successfully!",
            "duration": 5000,
            "priority": "success",
            "icon": "check",
            "timestamp": datetime.now().isoformat()
        }
        
        response = requests.post(
            f"{MODAL_SERVER_URL}/api/test/modal",
            json=final_data,
            timeout=10
        )
        
        final_result = {"status_code": response.status_code, "response": response.text}
        results.append({
            "message_number": len(results) + 1,
            "message": "Final success message",
            "result": final_result
        })
        
        return {
            "success": True,
            "test_sequence": "modal_test_sequence",
            "total_messages": len(results),
            "results": results,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Test sequence error: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@mcp.tool()
def modal_version() -> Dict[str, Any]:
    """
    Get the current version and build information of the MCP server.
    
    Returns:
        Version information
    """
    return {
        "success": True,
        "version": "2.0.0",
        "build_date": "2025-07-28",
        "features": [
            "synchronous_http_requests",
            "auto_restart_support",
            "modal_control",
            "progress_tracking",
            "custom_actions"
        ],
        "server_url": MODAL_SERVER_URL,
        "timestamp": datetime.now().isoformat()
    }

@mcp.tool()
def modal_send_interactive_step(
    message: str,
    test_step: str,
    test_id: str,
    priority: str = "info",
    icon: str = "info"
) -> Dict[str, Any]:
    """
    Send an interactive test step to the modal with Success/Failed/Stop buttons.
    
    Args:
        message: Message to display
        test_step: Name of the test step
        test_id: Unique identifier for this test step
        priority: Message priority (info, success, warning, error)
        icon: Icon to display
        
    Returns:
        Interactive step status
    """
    try:
        import requests
        
        # Prepare interactive step data
        message_data = {
            "action": "interactive",
            "message": message,
            "priority": priority,
            "icon": icon,
            "interactive": True,
            "testStep": test_step,
            "testId": test_id,
            "timestamp": datetime.now().isoformat()
        }
        
        # Send HTTP request directly
        response = requests.post(
            f"{MODAL_SERVER_URL}/api/test/modal",
            json=message_data,
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            return {
                "success": True,
                "message": message,
                "test_step": test_step,
                "test_id": test_id,
                "result": result,
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "success": False,
                "error": f"Server returned {response.status_code}",
                "message": message,
                "details": response.text
            }
            
    except Exception as e:
        logger.error(f"Error sending interactive step: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": message
        }

@mcp.tool()
def modal_wait_for_response(test_id: str, timeout: int = 300) -> Dict[str, Any]:
    """
    Wait for user response to an interactive test step.
    
    Args:
        test_id: The test ID to wait for response
        timeout: Timeout in seconds (default 300)
        
    Returns:
        User response or timeout
    """
    try:
        import requests
        import time
        
        start_time = time.time()
        while time.time() - start_time < timeout:
            # Check for response
            response = requests.get(
                f"{MODAL_SERVER_URL}/api/test/response/{test_id}",
                timeout=5
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("response") is not None:
                    return {
                        "success": True,
                        "response": result.get("response"),
                        "step": result.get("step"),
                        "timestamp": result.get("timestamp"),
                        "test_id": test_id
                    }
            
            time.sleep(1)  # Poll every second
        
        # Timeout
        return {
            "success": False,
            "response": "timeout",
            "test_id": test_id,
            "error": f"Timeout after {timeout} seconds"
        }
        
    except Exception as e:
        logger.error(f"Error waiting for response: {e}")
        return {
            "success": False,
            "error": str(e),
            "test_id": test_id
        }

# ============================================================================
# SERVER STARTUP AND CONFIGURATION
# ============================================================================

def main():
    """Main server startup function."""
    parser = argparse.ArgumentParser(description="FrontRow Modal MCP Server")
    parser.add_argument("--stdio", action="store_true", help="Run in stdio mode")
    parser.add_argument("--port", type=int, default=8001, help="Server port")
    parser.add_argument("--host", default="127.0.0.1", help="Server host")
    parser.add_argument("--modal-url", default="http://localhost:3001", help="Modal server URL")
    
    args = parser.parse_args()
    
    # Update global configuration
    global SERVER_PORT, SERVER_HOST, MODAL_SERVER_URL
    SERVER_PORT = args.port
    SERVER_HOST = args.host
    MODAL_SERVER_URL = args.modal_url
    
    # Update modal controller
    global modal_controller
    modal_controller = ModalController(MODAL_SERVER_URL)
    
    logger.info(f"Starting FrontRow Modal MCP Server v{SERVER_VERSION}")
    logger.info(f"Modal server URL: {MODAL_SERVER_URL}")
    
    if args.stdio:
        logger.info("Running in stdio mode")
        mcp.run(transport="stdio")
    else:
        logger.info(f"Running in HTTP mode on {SERVER_HOST}:{SERVER_PORT}")
        mcp.run(transport="streamable-http", host=SERVER_HOST, port=SERVER_PORT)

if __name__ == "__main__":
    main() # Test comment for auto-restart
# Force restart test
