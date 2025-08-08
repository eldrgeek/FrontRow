# MCP Server Setup for Cursor

This guide explains how to configure the FrontRow Modal MCP server in Cursor so AI tools can control the cross-desktop modal for testing.

## Prerequisites
- Backend server running on `http://localhost:3001`
- Modal app running (Electron + Vite) via `python start_dev.py --full` or manual start
- Python 3.9+ with dependencies (installed automatically by `start_dev.py`)

## Recommended: Start All Services
```bash
python start_dev.py --full
```
- Starts: Backend (3001), Frontend (5173), Modal app (5174 + Electron), MCP server (8001)
- MCP auto-restarts on changes to `mcp_modal_server.py`

## Configure in Cursor (STDIO Mode)
STDIO is the most reliable for Claude/Cursor.

- **Name**: `frontrow-modal`
- **Command**: `python`
- **Args**: `mcp_modal_server.py --stdio`
- **CWD**: Full path to your FrontRow project directory

Example JSON for Cursor settings:
```json
{
  "mcpServers": {
    "frontrow-modal": {
      "command": "python",
      "args": [
        "/Users/USERNAME/Projects/FrontRow/mcp_modal_server.py",
        "--stdio"
      ],
      "cwd": "/Users/USERNAME/Projects/FrontRow",
      "description": "FrontRow Modal Testing System"
    }
  }
}
```

## Alternate: HTTP Mode
Useful if you want to exercise endpoints directly.

- Start: `python mcp_modal_server.py --host 127.0.0.1 --port 8001 --modal-url http://localhost:3001`
- Exercise via `python test_modal_mcp.py`

## Available MCP Tools
- `modal_connect(server_url)`
- `modal_show_message(message, duration, priority, icon)`
- `modal_hide()`
- `modal_progress(progress, message)`
- `modal_ask_question(question, options)`
- `modal_send_custom(action, data)`
- `modal_send_interactive_step(message, test_step, test_id, priority, icon)`
- `modal_wait_for_response(test_id, timeout)`
- `modal_status()`
- `modal_test_sequence()`

## Notes
- The MCP server talks to the backend at `http://localhost:3001`, which relays to the modal via Socket.IO.
- If you edit `mcp_modal_server.py`, restart it before testing unless running `start_dev.py --full` (auto-restart).
- Check MCP logs at `~/mcp_modal_server.log` for failures.

