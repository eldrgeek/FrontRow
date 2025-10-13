#!/bin/bash

###############################################################################
# FrontRow Modal System Manager
# ==============================
# 
# Manages the background services needed for AI/Claude to interact with
# the FrontRow modal system.
#
# Services:
#   - Backend Server (port 3001) - Modal communication endpoint
#   - Modal App (port 5174) - Desktop modal application  
#   - MCP Server (port 8001) - AI integration layer
#
# Usage:
#   ./start-modal-system.sh install    # Install PM2 and start services
#   ./start-modal-system.sh start      # Start modal system
#   ./start-modal-system.sh stop       # Stop modal system
#   ./start-modal-system.sh restart    # Restart modal system
#   ./start-modal-system.sh status     # Show status
#   ./start-modal-system.sh logs       # Show logs
#   ./start-modal-system.sh startup    # Enable auto-start on boot
#   ./start-modal-system.sh remove     # Remove from PM2
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
ORANGE='\033[0;33m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; exit 1; }

check_pm2() {
    command -v pm2 &> /dev/null
}

install_pm2() {
    print_info "Installing PM2..."
    if command -v npm &> /dev/null; then
        npm install -g pm2
        print_success "PM2 installed successfully"
    else
        print_error "npm is not installed. Please install Node.js first."
    fi
}

check_python_deps() {
    print_info "Checking Python dependencies..."
    if ! python3 -c "import fastmcp, uvicorn, aiohttp, websockets" 2>/dev/null; then
        print_warning "Installing MCP server dependencies..."
        pip3 install -r requirements_modal_mcp.txt
        print_success "Python dependencies installed"
    fi
}

create_logs_dir() {
    if [ ! -d "logs" ]; then
        mkdir -p logs
        print_info "Created logs directory"
    fi
}

start_services() {
    print_info "Starting FrontRow Modal System..."
    echo ""
    
    check_python_deps
    create_logs_dir
    
    # Start services using modal ecosystem config
    pm2 start ecosystem.modal.config.js
    
    echo ""
    print_success "Modal System started!"
    echo ""
    print_info "Services running:"
    echo -e "  ${BLUE}⚙️  Backend:${NC}     http://localhost:3001"
    echo -e "  ${CYAN}🖥️  Modal App:${NC}    http://localhost:5174 + Desktop"
    echo -e "  ${ORANGE}🤖 MCP Server:${NC}   http://localhost:8001"
    echo ""
    pm2 list
}

stop_services() {
    print_info "Stopping Modal System..."
    pm2 stop modal-system
    print_success "Modal System stopped"
}

restart_services() {
    print_info "Restarting Modal System..."
    pm2 restart modal-system
    print_success "Modal System restarted"
    echo ""
    pm2 list
}

show_status() {
    print_info "FrontRow Modal System Status:"
    echo ""
    pm2 list
    echo ""
    print_info "Service Endpoints:"
    echo -e "  ${BLUE}⚙️  Backend:${NC}     http://localhost:3001"
    echo -e "  ${CYAN}🖥️  Modal App:${NC}    http://localhost:5174 + Desktop"
    echo -e "  ${ORANGE}🤖 MCP Server:${NC}   http://localhost:8001"
    echo ""
    print_info "Test MCP Connection:"
    echo "  python test_modal_mcp.py"
}

show_logs() {
    print_info "Showing Modal System logs (Ctrl+C to exit)..."
    pm2 logs modal-system
}

configure_startup() {
    print_info "Configuring Modal System to start on boot..."
    echo ""
    
    # Generate startup script
    print_warning "Run this command to enable PM2 startup:"
    pm2 startup
    
    echo ""
    read -p "Press Enter after running the startup command (or Ctrl+C to skip)..."
    
    # Save current process list
    pm2 save
    
    print_success "Startup configuration saved!"
    print_info "Modal System will now start automatically on system boot."
}

remove_services() {
    print_warning "This will remove the Modal System from PM2."
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        pm2 delete modal-system 2>/dev/null || true
        pm2 save --force
        print_success "Modal System removed from PM2"
    else
        print_info "Cancelled"
    fi
}

case "${1:-}" in
    install)
        print_info "=== FrontRow Modal System Setup ==="
        echo ""
        
        if ! check_pm2; then
            install_pm2
        else
            print_success "PM2 is already installed"
        fi
        
        start_services
        
        echo ""
        print_success "Setup complete!"
        echo ""
        print_info "Next steps:"
        echo "  1. Run './start-modal-system.sh status' to check status"
        echo "  2. Run './start-modal-system.sh startup' to enable auto-start on boot"
        echo "  3. Run 'python test_modal_mcp.py' to test MCP connection"
        echo "  4. Open Cursor and the MCP server will be available for AI interactions"
        ;;
    
    start)
        check_pm2 || print_error "PM2 not installed. Run './start-modal-system.sh install'"
        start_services
        ;;
    
    stop)
        check_pm2 || print_error "PM2 not installed."
        stop_services
        ;;
    
    restart)
        check_pm2 || print_error "PM2 not installed."
        restart_services
        ;;
    
    status)
        check_pm2 || print_error "PM2 not installed."
        show_status
        ;;
    
    logs)
        check_pm2 || print_error "PM2 not installed."
        show_logs
        ;;
    
    startup)
        check_pm2 || print_error "PM2 not installed."
        configure_startup
        ;;
    
    remove)
        check_pm2 || print_error "PM2 not installed."
        remove_services
        ;;
    
    *)
        echo "FrontRow Modal System Manager"
        echo ""
        echo "Usage: $0 {install|start|stop|restart|status|logs|startup|remove}"
        echo ""
        echo "Commands:"
        echo "  install  - Install PM2 and start Modal System"
        echo "  start    - Start Modal System (backend + modal app + MCP server)"
        echo "  stop     - Stop Modal System"
        echo "  restart  - Restart Modal System"
        echo "  status   - Show status and endpoints"
        echo "  logs     - Show logs for all services"
        echo "  startup  - Enable auto-start on system boot"
        echo "  remove   - Remove from PM2"
        echo ""
        exit 1
        ;;
esac

