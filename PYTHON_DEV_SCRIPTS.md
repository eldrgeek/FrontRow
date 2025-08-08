# Python Development Scripts

FrontRow provides a unified Python launcher and test scripts to streamline development and end-to-end testing.

## start_dev.py
Unified launcher for all services.

### Usage
```bash
# Full environment (Backend + Frontend + Modal + MCP)
python start_dev.py --full

# Basic environment (Backend + Frontend + Modal)
python start_dev.py --basic

# MCP server only
python start_dev.py --mcp-only
```

### Features
- Cross-platform process management and cleanup
- Auto-install MCP Python deps when needed
- Colorized output and status panel
- Auto-restart of MCP server on file changes

## MCP Test Scripts

### test_modal_mcp.py
Runs an end-to-end exercise of MCP tools in HTTP mode (when MCP is started over HTTP).

```bash
python test_modal_mcp.py
```

### test_mcp_restart.py
Verifies MCP server auto-restart when `mcp_modal_server.py` changes (in `--full` mode).

```bash
python test_mcp_restart.py
```

## Modal Tests (Direct)

### packages/modal-app/test-modal.py
Sends a sequence of messages to the modal via backend Socket.IO.

```bash
python packages/modal-app/test-modal.py
```

## Notes
- Prefer `python start_dev.py --full` to ensure a consistent environment.
- Test endpoints are available on the backend when `NODE_ENV=development` or `ENABLE_TEST_ENDPOINTS=true`.
- The modal app connects to the backend at `http://localhost:3001`.

