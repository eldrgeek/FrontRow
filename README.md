# FrontRow

A real-time virtual venue application for live performances with audience interaction.

## Project Structure

- `front-row-vite/` - Main React frontend application
- `server/` - Node.js + Socket.io backend server
- `packages/modal-app/` - Electron test notification modal
- `automation/` - Python test automation scripts
- `e2e_test_coordinator.py` - End-to-end test coordinator

## Quick Start

### Development Environment

**Option 1: Use the Python development script (Recommended)**
```bash
# Basic mode (backend + frontend + modal)
python start_dev.py

# Full mode (includes MCP server for AI integration)
python start_dev.py --full

# MCP server only
python start_dev.py --mcp-only
```

**Option 2: Manual startup**
1. **Start the server:**
   ```bash
   cd server
   npm install
   npm start
   ```

2. **Start the frontend:**
   ```bash
   cd front-row-vite
   npm install
   npm run dev
   ```

3. **Start the test modal (optional):**
   ```bash
   cd packages/modal-app
   npm install
   npm start
   ```

### Testing

**Test the modal notifications:**
```bash
python packages/modal-app/test-modal.py
```

**Test the MCP server (when running in full mode):**
```bash
python test_modal_mcp.py
```

**Run E2E tests:**
```bash
python e2e_test_coordinator.py
```

## Features

- **Real-time WebRTC streaming** between performers and audience
- **3D venue visualization** with seat selection
- **Multi-user coordination** with live audience interaction
- **Test automation** with comprehensive E2E testing
- **Cross-desktop notifications** via Electron modal app

## Documentation

- [Deployment Guide](DEPLOYMENT_GUIDE.md)
- [E2E Testing Architecture](E2E_TESTING_ARCHITECTURE.md)
- [Python Development Scripts](PYTHON_DEV_SCRIPTS.md)
- [MCP Server Setup for Cursor](MCP_CURSOR_SETUP.md)
- [Modal App Documentation](packages/modal-app/README.md)
- [Test Configuration](server/test-config.md)

## Development

### Environment Variables

**Server:**
- `NODE_ENV=development` - Enables test endpoints and logging
- `ENABLE_TEST_ENDPOINTS=true` - Enables test API in production
- `ENABLE_TEST_LOGGING=true` - Enables test logging in production

**Client:**
- `VITE_ENABLE_TEST_MODE=true` - Enables test components in production

### Testing

The project includes comprehensive testing infrastructure:

- **E2E Test Coordinator** - Python-based test orchestration
- **Test Modal App** - Cross-desktop notification system
- **Server Test API** - Programmatic test control
- **Scene Test Exposer** - 3D scene interaction for tests

## License

MIT License - see [LICENSE](LICENSE) file for details.
