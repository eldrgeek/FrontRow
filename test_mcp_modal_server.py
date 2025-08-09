#!/usr/bin/env python3
"""
Unit tests for MCP Modal Server
================================

Comprehensive test suite for the FrontRow Modal MCP Server,
covering all functions, error handling, and edge cases.
"""

import pytest
import json
import asyncio
from unittest.mock import Mock, patch, MagicMock, AsyncMock, call
from datetime import datetime
import aiohttp
import sys
import os
import time

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the module to test
import mcp_modal_server


class TestModalController:
    """Test the ModalController class."""
    
    @pytest.fixture
    def controller(self):
        """Create a ModalController instance for testing."""
        return mcp_modal_server.ModalController("http://test-server:3001")
    
    @pytest.mark.asyncio
    async def test_connect_success(self, controller):
        """Test successful connection to modal server."""
        # Mock the aiohttp session
        mock_response = AsyncMock()
        mock_response.status = 200
        
        with patch.object(controller, 'session', create=True) as mock_session:
            mock_session.get.return_value.__aenter__.return_value = mock_response
            
            result = await controller.connect()
            
            assert result is True
            assert controller.connected is True
    
    @pytest.mark.asyncio
    async def test_connect_failure(self, controller):
        """Test failed connection to modal server."""
        # Mock the aiohttp session to raise an exception
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session.get.side_effect = Exception("Connection failed")
            mock_session_class.return_value = mock_session
            controller.session = mock_session
            
            result = await controller.connect()
            
            assert result is False
            assert controller.connected is False
    
    @pytest.mark.asyncio
    async def test_disconnect(self, controller):
        """Test disconnecting from modal server."""
        controller.session = AsyncMock()
        controller.connected = True
        
        await controller.disconnect()
        
        assert controller.session is None
        assert controller.connected is False
    
    @pytest.mark.asyncio
    async def test_send_message_success(self, controller):
        """Test successful message sending."""
        controller.connected = True
        controller.session = AsyncMock()
        
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={"status": "ok"})
        
        # Create async context manager mock
        async_cm = AsyncMock()
        async_cm.__aenter__.return_value = mock_response
        controller.session.post.return_value = async_cm
        
        message_data = {"action": "test", "message": "Test message"}
        result = await controller.send_message(message_data)
        
        assert result["success"] is True
        assert result["message_id"] == 1
        assert "timestamp" in result
    
    @pytest.mark.asyncio
    async def test_send_message_server_error(self, controller):
        """Test message sending with server error."""
        controller.connected = True
        controller.session = AsyncMock()
        
        mock_response = AsyncMock()
        mock_response.status = 500
        mock_response.text = AsyncMock(return_value="Internal Server Error")
        
        # Create async context manager mock
        async_cm = AsyncMock()
        async_cm.__aenter__.return_value = mock_response
        controller.session.post.return_value = async_cm
        
        message_data = {"action": "test", "message": "Test message"}
        result = await controller.send_message(message_data)
        
        assert result["success"] is False
        assert "error" in result
        assert "500" in result["error"]
    
    @pytest.mark.asyncio
    async def test_send_message_network_error(self, controller):
        """Test message sending with network error."""
        controller.connected = True
        controller.session = AsyncMock()
        controller.session.post.side_effect = Exception("Network error")
        
        message_data = {"action": "test", "message": "Test message"}
        result = await controller.send_message(message_data)
        
        assert result["success"] is False
        assert "error" in result
        assert "Network error" in result["error"]
    
    @pytest.mark.asyncio
    async def test_show_modal(self, controller):
        """Test showing modal with message."""
        controller.connected = True
        controller.session = AsyncMock()
        
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={"status": "shown"})
        
        # Create async context manager mock
        async_cm = AsyncMock()
        async_cm.__aenter__.return_value = mock_response
        controller.session.post.return_value = async_cm
        
        result = await controller.show_modal("Test message", duration=5000, priority="info", icon="test")
        
        assert result["success"] is True
        # Verify the message data was sent correctly
        call_args = controller.session.post.call_args
        sent_data = call_args[1]["json"]
        assert sent_data["action"] == "show"
        assert sent_data["message"] == "Test message"
        assert sent_data["duration"] == 5000
        assert sent_data["priority"] == "info"
        assert sent_data["icon"] == "test"
    
    @pytest.mark.asyncio
    async def test_hide_modal(self, controller):
        """Test hiding modal."""
        controller.connected = True
        controller.session = AsyncMock()
        
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={"status": "hidden"})
        
        # Create async context manager mock
        async_cm = AsyncMock()
        async_cm.__aenter__.return_value = mock_response
        controller.session.post.return_value = async_cm
        
        result = await controller.hide_modal()
        
        assert result["success"] is True
        # Verify the hide action was sent
        call_args = controller.session.post.call_args
        sent_data = call_args[1]["json"]
        assert sent_data["action"] == "hide"
    
    @pytest.mark.asyncio
    async def test_update_progress(self, controller):
        """Test updating progress bar."""
        controller.connected = True
        controller.session = AsyncMock()
        
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={"status": "updated"})
        
        # Create async context manager mock
        async_cm = AsyncMock()
        async_cm.__aenter__.return_value = mock_response
        controller.session.post.return_value = async_cm
        
        result = await controller.update_progress(50, "Halfway there")
        
        assert result["success"] is True
        # Verify progress data was sent
        call_args = controller.session.post.call_args
        sent_data = call_args[1]["json"]
        assert sent_data["action"] == "progress"
        assert sent_data["progress"] == 50
        assert sent_data["message"] == "Halfway there"
    
    @pytest.mark.asyncio
    async def test_ask_question(self, controller):
        """Test asking a question."""
        controller.connected = True
        controller.session = AsyncMock()
        
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={"status": "question_sent"})
        
        # Create async context manager mock
        async_cm = AsyncMock()
        async_cm.__aenter__.return_value = mock_response
        controller.session.post.return_value = async_cm
        
        result = await controller.ask_question("Continue?", ["Yes", "No"])
        
        assert result["success"] is True
        # Verify question data was sent
        call_args = controller.session.post.call_args
        sent_data = call_args[1]["json"]
        assert sent_data["action"] == "question"
        assert sent_data["question"] == "Continue?"
        assert sent_data["options"] == ["Yes", "No"]


class TestMCPToolFunctions:
    """Test the MCP tool functions."""
    
    @patch('requests.get')
    def test_modal_connect_success(self, mock_get):
        """Test successful modal_connect."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_get.return_value = mock_response
        
        result = mcp_modal_server.modal_connect.fn("http://test:3001")
        
        assert result["success"] is True
        assert result["connected"] is True
        assert result["server_url"] == "http://test:3001"
        mock_get.assert_called_with("http://test:3001/health", timeout=5)
    
    @patch('requests.get')
    def test_modal_connect_failure(self, mock_get):
        """Test failed modal_connect."""
        mock_get.side_effect = Exception("Connection refused")
        
        result = mcp_modal_server.modal_connect.fn("http://test:3001")
        
        assert result["success"] is False
        assert result["connected"] is False
        assert "Connection refused" in result["error"]
    
    @patch('requests.get')
    def test_modal_connect_http_error(self, mock_get):
        """Test modal_connect with HTTP error."""
        mock_response = Mock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response
        
        result = mcp_modal_server.modal_connect.fn("http://test:3001")
        
        assert result["success"] is False
        assert result["connected"] is False
        assert "404" in result["error"]
    
    @patch('requests.post')
    def test_modal_show_message_success(self, mock_post):
        """Test successful modal_show_message."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "shown"}
        mock_post.return_value = mock_response
        
        result = mcp_modal_server.modal_show_message.fn(
            "Test message",
            duration=3000,
            priority="info",
            icon="test"
        )
        
        assert result["success"] is True
        assert result["message"] == "Test message"
        
        # Verify the request data
        call_args = mock_post.call_args
        sent_data = call_args[1]["json"]
        assert sent_data["action"] == "show"
        assert sent_data["message"] == "Test message"
        assert sent_data["duration"] == 3000
        assert sent_data["priority"] == "info"
        assert sent_data["icon"] == "test"
    
    @patch('requests.post')
    def test_modal_show_message_error(self, mock_post):
        """Test modal_show_message with error."""
        mock_post.side_effect = Exception("Network error")
        
        result = mcp_modal_server.modal_show_message.fn("Test message")
        
        assert result["success"] is False
        assert "Network error" in result["error"]
        assert result["message"] == "Test message"
    
    @patch('requests.post')
    def test_modal_hide_success(self, mock_post):
        """Test successful modal_hide."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "hidden"}
        mock_post.return_value = mock_response
        
        result = mcp_modal_server.modal_hide.fn()
        
        assert result["success"] is True
        
        # Verify the request data
        call_args = mock_post.call_args
        sent_data = call_args[1]["json"]
        assert sent_data["action"] == "hide"
    
    @patch('requests.post')
    def test_modal_progress_success(self, mock_post):
        """Test successful modal_progress."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "updated"}
        mock_post.return_value = mock_response
        
        result = mcp_modal_server.modal_progress.fn(75, "Almost done")
        
        assert result["success"] is True
        assert result["progress"] == 75
        
        # Verify the request data
        call_args = mock_post.call_args
        sent_data = call_args[1]["json"]
        assert sent_data["action"] == "progress"
        assert sent_data["progress"] == 75
        assert sent_data["message"] == "Almost done"
    
    @patch('requests.post')
    def test_modal_progress_without_message(self, mock_post):
        """Test modal_progress without message."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "updated"}
        mock_post.return_value = mock_response
        
        result = mcp_modal_server.modal_progress.fn(50)
        
        assert result["success"] is True
        assert result["progress"] == 50
        
        # Verify message not in request data
        call_args = mock_post.call_args
        sent_data = call_args[1]["json"]
        assert "message" not in sent_data or sent_data.get("message") is None
    
    @patch('requests.post')
    def test_modal_ask_question_success(self, mock_post):
        """Test successful modal_ask_question."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "question_sent"}
        mock_post.return_value = mock_response
        
        result = mcp_modal_server.modal_ask_question.fn(
            "Continue?",
            options=["Yes", "No", "Cancel"]
        )
        
        assert result["success"] is True
        assert result["question"] == "Continue?"
        assert result["options"] == ["Yes", "No", "Cancel"]
        
        # Verify the request data
        call_args = mock_post.call_args
        sent_data = call_args[1]["json"]
        assert sent_data["action"] == "question"
        assert sent_data["question"] == "Continue?"
        assert sent_data["options"] == ["Yes", "No", "Cancel"]
    
    @patch('requests.post')
    def test_modal_send_custom_with_json_data(self, mock_post):
        """Test modal_send_custom with JSON data."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "custom_sent"}
        mock_post.return_value = mock_response
        
        custom_data = json.dumps({"key": "value", "number": 42})
        result = mcp_modal_server.modal_send_custom.fn("custom_action", custom_data)
        
        assert result["success"] is True
        assert result["action"] == "custom_action"
        
        # Verify the request data
        call_args = mock_post.call_args
        sent_data = call_args[1]["json"]
        assert sent_data["action"] == "custom_action"
        assert sent_data["key"] == "value"
        assert sent_data["number"] == 42
    
    @patch('requests.post')
    def test_modal_send_custom_with_plain_data(self, mock_post):
        """Test modal_send_custom with plain string data."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "custom_sent"}
        mock_post.return_value = mock_response
        
        result = mcp_modal_server.modal_send_custom.fn("custom_action", "plain text")
        
        assert result["success"] is True
        assert result["action"] == "custom_action"
        
        # Verify the request data
        call_args = mock_post.call_args
        sent_data = call_args[1]["json"]
        assert sent_data["action"] == "custom_action"
        assert sent_data["data"] == "plain text"
    
    def test_modal_status(self):
        """Test modal_status function."""
        # Set up controller state
        mcp_modal_server.modal_controller.server_url = "http://test:3001"
        mcp_modal_server.modal_controller.connected = True
        mcp_modal_server.modal_controller.last_message_id = 5
        
        result = mcp_modal_server.modal_status.fn()
        
        assert result["success"] is True
        assert result["server_url"] == "http://test:3001"
        assert result["connected"] is True
        assert result["last_message_id"] == 5
        assert result["server_version"] == mcp_modal_server.SERVER_VERSION
        assert "timestamp" in result
    
    def test_modal_status_with_error(self):
        """Test modal_status with exception."""
        # Mock the controller to raise an exception when accessed
        original_controller = mcp_modal_server.modal_controller
        try:
            # Create a mock that raises when any attribute is accessed
            mock_controller = Mock()
            mock_controller.server_url = Mock(side_effect=Exception("Test error"))
            mcp_modal_server.modal_controller = mock_controller
            
            result = mcp_modal_server.modal_status.fn()
            
            assert result["success"] is False
            assert "Test error" in result["error"]
        finally:
            # Restore original controller
            mcp_modal_server.modal_controller = original_controller
    
    @patch('requests.post')
    def test_modal_send_interactive_step(self, mock_post):
        """Test modal_send_interactive_step."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "interactive_sent"}
        mock_post.return_value = mock_response
        
        result = mcp_modal_server.modal_send_interactive_step.fn(
            message="Run test step",
            test_step="step_1",
            test_id="test_123",
            priority="warning",
            icon="play"
        )
        
        assert result["success"] is True
        assert result["message"] == "Run test step"
        assert result["test_step"] == "step_1"
        assert result["test_id"] == "test_123"
        
        # Verify the request data
        call_args = mock_post.call_args
        sent_data = call_args[1]["json"]
        assert sent_data["action"] == "interactive"
        assert sent_data["message"] == "Run test step"
        assert sent_data["interactive"] is True
        assert sent_data["testStep"] == "step_1"
        assert sent_data["testId"] == "test_123"
        assert sent_data["priority"] == "warning"
        assert sent_data["icon"] == "play"
    
    @patch('requests.get')
    @patch('time.time')
    @patch('time.sleep')
    def test_modal_wait_for_response_success(self, mock_sleep, mock_time, mock_get):
        """Test modal_wait_for_response with successful response."""
        # Mock time to control the loop
        mock_time.side_effect = [0, 1, 2]  # Three calls to time()
        
        # Mock response with result on second attempt
        mock_response1 = Mock()
        mock_response1.status_code = 200
        mock_response1.json.return_value = {"response": None}
        
        mock_response2 = Mock()
        mock_response2.status_code = 200
        mock_response2.json.return_value = {
            "response": "success",
            "step": "step_1",
            "timestamp": "2025-01-01T00:00:00"
        }
        
        mock_get.side_effect = [mock_response1, mock_response2]
        
        result = mcp_modal_server.modal_wait_for_response.fn("test_123", timeout=10)
        
        assert result["success"] is True
        assert result["response"] == "success"
        assert result["step"] == "step_1"
        assert result["test_id"] == "test_123"
    
    @patch('requests.get')
    @patch('time.time')
    @patch('time.sleep')
    def test_modal_wait_for_response_timeout(self, mock_sleep, mock_time, mock_get):
        """Test modal_wait_for_response with timeout."""
        # Mock time to simulate timeout
        mock_time.side_effect = [0, 100, 200, 301]  # Exceed 300 second timeout
        
        # Mock response with no result
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"response": None}
        mock_get.return_value = mock_response
        
        result = mcp_modal_server.modal_wait_for_response.fn("test_123", timeout=300)
        
        assert result["success"] is False
        assert result["response"] == "timeout"
        assert result["test_id"] == "test_123"
        assert "Timeout after 300 seconds" in result["error"]
    
    @patch('requests.get')
    def test_modal_wait_for_response_error(self, mock_get):
        """Test modal_wait_for_response with exception."""
        mock_get.side_effect = Exception("Network error")
        
        result = mcp_modal_server.modal_wait_for_response.fn("test_123")
        
        assert result["success"] is False
        assert "Network error" in result["error"]
        assert result["test_id"] == "test_123"
    
    def test_modal_version(self):
        """Test modal_version function."""
        result = mcp_modal_server.modal_version.fn()
        
        assert result["success"] is True
        assert "version" in result
        assert "build_date" in result
        assert "features" in result
        assert isinstance(result["features"], list)
        assert result["server_url"] == mcp_modal_server.MODAL_SERVER_URL
        assert "timestamp" in result


class TestTestSequence:
    """Test the test sequence functions."""
    
    @patch('requests.post')
    @patch('time.sleep')
    def test_modal_test_sequence_success(self, mock_sleep, mock_post):
        """Test successful modal_test_sequence."""
        # Mock successful responses for all requests
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = "OK"
        mock_post.return_value = mock_response
        
        result = mcp_modal_server.modal_test_sequence.fn()
        
        assert result["success"] is True
        assert result["test_sequence"] == "modal_test_sequence"
        assert result["total_messages"] > 0
        assert isinstance(result["results"], list)
        assert "timestamp" in result
        
        # Verify multiple calls were made
        assert mock_post.call_count > 5  # Multiple test messages + progress updates
    
    @patch('requests.post')
    def test_modal_test_sequence_error(self, mock_post):
        """Test modal_test_sequence with error."""
        mock_post.side_effect = Exception("Test error")
        
        result = mcp_modal_server.modal_test_sequence.fn()
        
        assert result["success"] is False
        assert "Test error" in result["error"]


class TestHelperFunctions:
    """Test helper functions."""
    
    @patch('asyncio.create_task')
    def test_cleanup_resources_connected(self, mock_create_task):
        """Test cleanup_resources when connected."""
        mcp_modal_server.modal_controller.connected = True
        
        mcp_modal_server.cleanup_resources()
        
        # Verify disconnect task was created
        mock_create_task.assert_called_once()
    
    def test_cleanup_resources_not_connected(self):
        """Test cleanup_resources when not connected."""
        mcp_modal_server.modal_controller.connected = False
        
        # Should complete without error
        mcp_modal_server.cleanup_resources()


class TestMainFunction:
    """Test the main function."""
    
    @patch('mcp_modal_server.mcp.run')
    def test_main_stdio_mode(self, mock_run):
        """Test main function in stdio mode."""
        test_args = ['script.py', '--stdio']
        with patch('sys.argv', test_args):
            mcp_modal_server.main()
            
            mock_run.assert_called_once_with(transport="stdio")
    
    @patch('mcp_modal_server.mcp.run')
    def test_main_http_mode(self, mock_run):
        """Test main function in HTTP mode."""
        test_args = ['script.py', '--port', '9001', '--host', '0.0.0.0']
        with patch('sys.argv', test_args):
            mcp_modal_server.main()
            
            mock_run.assert_called_once_with(
                transport="streamable-http",
                host="0.0.0.0",
                port=9001
            )
    
    @patch('mcp_modal_server.mcp.run')
    def test_main_with_modal_url(self, mock_run):
        """Test main function with custom modal URL."""
        test_args = ['script.py', '--modal-url', 'http://custom:4000']
        with patch('sys.argv', test_args):
            mcp_modal_server.main()
            
            assert mcp_modal_server.MODAL_SERVER_URL == "http://custom:4000"
            assert mcp_modal_server.modal_controller.server_url == "http://custom:4000"


class TestEdgeCases:
    """Test edge cases and boundary conditions."""
    
    @pytest.mark.asyncio
    async def test_send_message_auto_connect(self):
        """Test send_message auto-connects when not connected."""
        controller = mcp_modal_server.ModalController("http://test:3001")
        controller.connected = False
        
        with patch.object(controller, 'connect', new_callable=AsyncMock) as mock_connect:
            mock_connect.return_value = True
            controller.session = AsyncMock()
            
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json = AsyncMock(return_value={"status": "ok"})
            
            # Create async context manager mock
            async_cm = AsyncMock()
            async_cm.__aenter__.return_value = mock_response
            controller.session.post.return_value = async_cm
            
            result = await controller.send_message({"test": "data"})
            
            mock_connect.assert_called_once()
            assert result["success"] is True
    
    @patch('requests.post')
    def test_modal_progress_boundary_values(self, mock_post):
        """Test modal_progress with boundary values."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "updated"}
        mock_post.return_value = mock_response
        
        # Test with 0%
        result = mcp_modal_server.modal_progress.fn(0)
        assert result["success"] is True
        assert result["progress"] == 0
        
        # Test with 100%
        result = mcp_modal_server.modal_progress.fn(100)
        assert result["success"] is True
        assert result["progress"] == 100
        
        # Test with negative value (edge case)
        result = mcp_modal_server.modal_progress.fn(-10)
        assert result["success"] is True
        assert result["progress"] == -10
        
        # Test with value over 100 (edge case)
        result = mcp_modal_server.modal_progress.fn(150)
        assert result["success"] is True
        assert result["progress"] == 150
    
    @patch('requests.post')
    def test_modal_show_message_empty_message(self, mock_post):
        """Test modal_show_message with empty message."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "shown"}
        mock_post.return_value = mock_response
        
        result = mcp_modal_server.modal_show_message.fn("")
        
        assert result["success"] is True
        assert result["message"] == ""
    
    @patch('requests.post')
    def test_modal_ask_question_no_options(self, mock_post):
        """Test modal_ask_question without options."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "question_sent"}
        mock_post.return_value = mock_response
        
        result = mcp_modal_server.modal_ask_question.fn("Open question?")
        
        assert result["success"] is True
        assert result["question"] == "Open question?"
        assert result["options"] is None
        
        # Verify options not in request
        call_args = mock_post.call_args
        sent_data = call_args[1]["json"]
        assert "options" not in sent_data or sent_data.get("options") is None
    
    @patch('requests.post')
    def test_modal_send_custom_no_data(self, mock_post):
        """Test modal_send_custom without additional data."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "custom_sent"}
        mock_post.return_value = mock_response
        
        result = mcp_modal_server.modal_send_custom.fn("bare_action")
        
        assert result["success"] is True
        assert result["action"] == "bare_action"
        assert result["data"] is None
        
        # Verify only action in request
        call_args = mock_post.call_args
        sent_data = call_args[1]["json"]
        assert sent_data["action"] == "bare_action"
        assert len(sent_data) == 1  # Only action field
    
    @patch('requests.post')
    def test_http_error_responses(self, mock_post):
        """Test various HTTP error responses."""
        error_codes = [400, 401, 403, 404, 500, 502, 503]
        
        for code in error_codes:
            mock_response = Mock()
            mock_response.status_code = code
            mock_response.text = f"Error {code}"
            mock_post.return_value = mock_response
            
            result = mcp_modal_server.modal_show_message.fn(f"Test {code}")
            
            assert result["success"] is False
            assert str(code) in result["error"]
            assert result["details"] == f"Error {code}"


class TestConcurrency:
    """Test concurrent operations."""
    
    @pytest.mark.asyncio
    async def test_concurrent_messages(self):
        """Test sending multiple messages concurrently."""
        controller = mcp_modal_server.ModalController("http://test:3001")
        controller.connected = True
        controller.session = AsyncMock()
        
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={"status": "ok"})
        
        # Create async context manager mock
        async_cm = AsyncMock()
        async_cm.__aenter__.return_value = mock_response
        controller.session.post.return_value = async_cm
        
        # Send multiple messages concurrently
        tasks = [
            controller.send_message({"message": f"Message {i}"})
            for i in range(5)
        ]
        
        results = await asyncio.gather(*tasks)
        
        # All should succeed
        assert all(r["success"] for r in results)
        # Message IDs should be sequential
        message_ids = [r["message_id"] for r in results]
        assert message_ids == [1, 2, 3, 4, 5]


class TestIntegration:
    """Integration tests for the complete flow."""
    
    @patch('requests.post')
    @patch('requests.get')
    def test_complete_interactive_flow(self, mock_get, mock_post):
        """Test complete interactive flow: connect -> show -> interactive -> wait -> hide."""
        # Step 1: Connect
        mock_get.return_value.status_code = 200
        connect_result = mcp_modal_server.modal_connect.fn()
        assert connect_result["success"] is True
        
        # Step 2: Show message
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {"status": "shown"}
        show_result = mcp_modal_server.modal_show_message.fn.fn("Starting test")
        assert show_result["success"] is True
        
        # Step 3: Send interactive step
        mock_post.return_value.json.return_value = {"status": "interactive_sent"}
        interactive_result = mcp_modal_server.modal_send_interactive_step.fn.fn(
            "Click to continue",
            "step_1",
            "test_flow_123"
        )
        assert interactive_result["success"] is True
        
        # Step 4: Wait for response (immediate response)
        mock_get.return_value.json.return_value = {
            "response": "success",
            "step": "step_1",
            "timestamp": "2025-01-01T00:00:00"
        }
        with patch('time.time', side_effect=[0, 1]):
            with patch('time.sleep'):
                wait_result = mcp_modal_server.modal_wait_for_response.fn("test_flow_123", timeout=10)
        assert wait_result["success"] is True
        assert wait_result["response"] == "success"
        
        # Step 5: Hide modal
        mock_post.return_value.json.return_value = {"status": "hidden"}
        hide_result = mcp_modal_server.modal_hide.fn.fn()
        assert hide_result["success"] is True