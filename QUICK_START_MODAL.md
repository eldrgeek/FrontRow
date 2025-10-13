# FrontRow Modal System - Quick Reference

## 🚀 One-Time Setup (Do This Once)

```bash
cd /Users/MikeWolf/Projects/FrontRow
./start-modal-system.sh install
./start-modal-system.sh startup
```

That's it! The modal system will now:
- ✅ Run in the background (no terminal needed)
- ✅ Auto-restart if it crashes
- ✅ Start automatically when your Mac boots
- ✅ Be available for Claude/AI interactions anytime

## 📋 Daily Commands

```bash
# Check if running
./start-modal-system.sh status

# Start services
./start-modal-system.sh start

# Stop services
./start-modal-system.sh stop

# Restart services
./start-modal-system.sh restart

# View logs
./start-modal-system.sh logs
```

## 🧪 Test It Works

```bash
python test_modal_mcp.py
```

## 🔗 Services

- **Backend**: http://localhost:3001
- **Modal App**: http://localhost:5174 (+ Desktop)
- **MCP Server**: http://localhost:8001

---

**Need more details?** See [MODAL_SYSTEM_PM2_GUIDE.md](MODAL_SYSTEM_PM2_GUIDE.md)

