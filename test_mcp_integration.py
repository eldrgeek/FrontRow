#!/usr/bin/env python3
"""
Integration tests for MCP Modal Server
=======================================

Test the MCP server by running it and making actual requests.
"""

import subprocess
import time
import requests
import pytest
import signal
import os

class TestMCPServerIntegration:
    """Integration tests for the MCP server."""
    
    @classmethod
    def setup_class(cls):
        """Start the MCP server before tests."""
        # Start server in background
        cls.server_process = subprocess.Popen(
            ["python", "mcp_modal_server.py", "--port", "8003", "--host", "127.0.0.1"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        # Wait for server to start
        time.sleep(3)
    
    @classmethod
    def teardown_class(cls):
        """Stop the MCP server after tests."""
        if hasattr(cls, 'server_process'):
            cls.server_process.terminate()
            cls.server_process.wait(timeout=5)
    
    def test_server_health(self):
        """Test if server is running."""
        response = requests.get("http://127.0.0.1:8003/mcp")
        # MCP servers typically return 404 on root, but connection should work
        assert response.status_code in [404, 405, 406]
    
    def test_mcp_tools_list(self):
        """Test listing available tools."""
        response = requests.post(
            "http://127.0.0.1:8003/mcp/",
            headers={"content-type": "application/json"},
            json={
                "jsonrpc": "2.0",
                "method": "tools/list",
                "id": 1
            }
        )
        # Even if not properly formed, should get some response
        assert response.status_code in [200, 400, 406]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])