# FrontRow Modal System - Background Service Setup

This guide explains how to run the FrontRow Modal System in the background so it's always available for AI/Claude interactions, even when Cursor is closed.

## 🎯 What Runs in the Background

The modal system consists of three services:

1. **Backend Server** (port 3001) - Handles modal communication
2. **Modal App** (port 5174) - The Electron desktop modal application
3. **MCP Server** (port 8001) - AI integration layer for Claude/Cursor

## 🚀 Quick Start

### First Time Setup

```bash
# Make the script executable
chmod +x start-modal-system.sh

# Install PM2 and start the modal system
./start-modal-system.sh install
```

This will:
- Install PM2 (process manager) if needed
- Check and install Python dependencies
- Start all three modal system services
- Show you the status

### Enable Auto-Start on Boot (Recommended)

To have the modal system start automatically when your Mac boots:

```bash
./start-modal-system.sh startup
```

Follow the instructions shown (you'll need to run one command with `sudo`).

## 📋 Daily Usage

### Check Status
```bash
./start-modal-system.sh status
```

### Start Services
```bash
./start-modal-system.sh start
```

### Stop Services
```bash
./start-modal-system.sh stop
```

### Restart Services
```bash
./start-modal-system.sh restart
```

### View Logs
```bash
./start-modal-system.sh logs
```

## 🧪 Testing

After starting the services, test the MCP connection:

```bash
python test_modal_mcp.py
```

## 📊 Monitoring

### View All Processes
```bash
pm2 list
```

### View Specific Service Logs
```bash
pm2 logs modal-backend   # Backend server logs
pm2 logs modal-app       # Modal app logs
pm2 logs mcp-server      # MCP server logs
```

### Real-time Monitoring Dashboard
```bash
pm2 monit
```

## 🔧 Advanced PM2 Commands

```bash
# Restart a specific service
pm2 restart mcp-server

# Stop a specific service
pm2 stop modal-backend

# View detailed info about a service
pm2 show mcp-server

# Clear all logs
pm2 flush

# Save current PM2 configuration
pm2 save

# Resurrect saved processes after reboot
pm2 resurrect
```

## 📁 Log Files

Logs are stored in the `logs/` directory:
- `logs/modal-backend-error.log` / `logs/modal-backend-out.log`
- `logs/modal-app-error.log` / `logs/modal-app-out.log`
- `logs/mcp-server-error.log` / `logs/mcp-server-out.log`

## 🔄 Updating the MCP Server

If you make changes to `mcp_modal_server.py`:

```bash
./start-modal-system.sh restart
```

PM2 will automatically restart the MCP server with your changes.

## 🗑️ Removal

To remove the modal system from PM2:

```bash
./start-modal-system.sh remove
```

To completely uninstall PM2:

```bash
pm2 kill
npm uninstall -g pm2
```

## 🆚 Comparison: PM2 vs Python Script

### `start_dev.py` (Development)
- ✅ Auto-restarts MCP server on file changes
- ✅ Colored output for debugging
- ✅ Good for active development
- ❌ Stops when terminal closes
- ❌ Requires terminal window open

### PM2 (Background/Production)
- ✅ Runs in background (no terminal needed)
- ✅ Survives terminal close
- ✅ Auto-restart on crashes
- ✅ Can start on system boot
- ✅ Built-in logging and monitoring
- ❌ Manual restart needed after code changes
- ❌ Less immediate feedback

## 💡 Recommended Workflow

1. **Development**: Use `python start_dev.py --full` when actively coding
2. **Background Use**: Use `./start-modal-system.sh start` when you want services running persistently
3. **Always On**: Run `./start-modal-system.sh startup` to have services start automatically

## 🐛 Troubleshooting

### Services won't start
```bash
# Check if ports are already in use
lsof -i :3001
lsof -i :5174
lsof -i :8001

# Kill existing processes if needed
pm2 delete all
```

### MCP server not working
```bash
# Check Python dependencies
pip3 install -r requirements_modal_mcp.txt

# Restart MCP server
pm2 restart mcp-server

# View logs
pm2 logs mcp-server
```

### Modal app not appearing
```bash
# Check if modal app is running
pm2 logs modal-app

# Restart modal app
pm2 restart modal-app
```

## 📝 Notes

- PM2 keeps processes running even if they crash (auto-restart)
- Logs are automatically rotated to prevent disk space issues
- Memory limits are set to prevent runaway processes
- The modal system uses about 500MB-1GB of RAM total
- All services are grouped under the `modal-system` namespace for easy management

## 🔗 Related Commands

```bash
# View all PM2 processes across all projects
pm2 list

# View only modal-system processes
pm2 list modal-system

# Restart all modal-system processes
pm2 restart modal-system

# Stop all modal-system processes
pm2 stop modal-system

# Delete all modal-system processes
pm2 delete modal-system
```

