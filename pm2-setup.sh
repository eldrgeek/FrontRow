#!/bin/bash

###############################################################################
# PM2 Setup Script for FrontRow
# ==============================
# 
# This script helps you set up PM2 to manage FrontRow services persistently.
# It will install PM2 if needed and configure services to start on boot.
#
# Usage:
#   ./pm2-setup.sh install     # Install PM2 and set up services
#   ./pm2-setup.sh start       # Start all services
#   ./pm2-setup.sh stop        # Stop all services
#   ./pm2-setup.sh restart     # Restart all services
#   ./pm2-setup.sh status      # Show status of all services
#   ./pm2-setup.sh logs        # Show logs for all services
#   ./pm2-setup.sh monitor     # Open PM2 monitoring dashboard
#   ./pm2-setup.sh startup     # Configure services to start on boot
#   ./pm2-setup.sh uninstall   # Remove all PM2 services
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# Function to print colored messages
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# Function to check if PM2 is installed
check_pm2() {
    if command -v pm2 &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to install PM2
install_pm2() {
    print_info "Installing PM2..."
    
    if command -v npm &> /dev/null; then
        npm install -g pm2
        print_success "PM2 installed successfully"
    else
        print_error "npm is not installed. Please install Node.js first."
    fi
}

# Function to create logs directory
create_logs_dir() {
    if [ ! -d "logs" ]; then
        mkdir -p logs
        print_info "Created logs directory"
    fi
}

# Function to start services
start_services() {
    print_info "Starting FrontRow services with PM2..."
    create_logs_dir
    
    # Start services using ecosystem config
    pm2 start ecosystem.config.js
    
    print_success "All services started!"
    echo ""
    pm2 list
}

# Function to stop services
stop_services() {
    print_info "Stopping FrontRow services..."
    pm2 stop all
    print_success "All services stopped!"
}

# Function to restart services
restart_services() {
    print_info "Restarting FrontRow services..."
    pm2 restart all
    print_success "All services restarted!"
    echo ""
    pm2 list
}

# Function to show status
show_status() {
    print_info "FrontRow services status:"
    echo ""
    pm2 list
    echo ""
    print_info "Service URLs:"
    echo "  🌐 Frontend:     http://localhost:5173"
    echo "  ⚙️  Backend:      http://localhost:3001"
    echo "  🖥️  Modal App:    http://localhost:5174"
    echo "  🤖 MCP Server:   http://localhost:8001"
}

# Function to show logs
show_logs() {
    print_info "Showing logs for all services (Ctrl+C to exit)..."
    pm2 logs
}

# Function to open monitoring dashboard
open_monitor() {
    print_info "Opening PM2 monitoring dashboard..."
    pm2 monit
}

# Function to configure startup on boot
configure_startup() {
    print_info "Configuring services to start on boot..."
    
    # Generate startup script
    pm2 startup
    
    echo ""
    print_warning "IMPORTANT: Copy and run the command shown above (if any) with sudo"
    echo ""
    read -p "Press Enter after you've run the startup command (or press Ctrl+C to skip)..."
    
    # Save current process list
    pm2 save
    
    print_success "Startup configuration saved!"
    print_info "Your services will now start automatically on system boot."
}

# Function to uninstall services
uninstall_services() {
    print_warning "This will remove all FrontRow services from PM2."
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Removing all services..."
        pm2 delete all 2>/dev/null || true
        pm2 save --force
        print_success "All services removed from PM2"
    else
        print_info "Uninstall cancelled"
    fi
}

# Main command handler
case "${1:-}" in
    install)
        print_info "=== FrontRow PM2 Setup ==="
        echo ""
        
        # Check if PM2 is installed
        if ! check_pm2; then
            install_pm2
        else
            print_success "PM2 is already installed"
        fi
        
        # Start services
        start_services
        
        echo ""
        print_success "Setup complete!"
        echo ""
        print_info "Next steps:"
        echo "  1. Run './pm2-setup.sh status' to check service status"
        echo "  2. Run './pm2-setup.sh startup' to enable services on boot"
        echo "  3. Run './pm2-setup.sh logs' to view service logs"
        echo "  4. Run './pm2-setup.sh monitor' to open the monitoring dashboard"
        ;;
    
    start)
        if ! check_pm2; then
            print_error "PM2 is not installed. Run './pm2-setup.sh install' first."
        fi
        start_services
        ;;
    
    stop)
        if ! check_pm2; then
            print_error "PM2 is not installed. Run './pm2-setup.sh install' first."
        fi
        stop_services
        ;;
    
    restart)
        if ! check_pm2; then
            print_error "PM2 is not installed. Run './pm2-setup.sh install' first."
        fi
        restart_services
        ;;
    
    status)
        if ! check_pm2; then
            print_error "PM2 is not installed. Run './pm2-setup.sh install' first."
        fi
        show_status
        ;;
    
    logs)
        if ! check_pm2; then
            print_error "PM2 is not installed. Run './pm2-setup.sh install' first."
        fi
        show_logs
        ;;
    
    monitor)
        if ! check_pm2; then
            print_error "PM2 is not installed. Run './pm2-setup.sh install' first."
        fi
        open_monitor
        ;;
    
    startup)
        if ! check_pm2; then
            print_error "PM2 is not installed. Run './pm2-setup.sh install' first."
        fi
        configure_startup
        ;;
    
    uninstall)
        if ! check_pm2; then
            print_error "PM2 is not installed."
        fi
        uninstall_services
        ;;
    
    *)
        echo "FrontRow PM2 Management Script"
        echo ""
        echo "Usage: $0 {install|start|stop|restart|status|logs|monitor|startup|uninstall}"
        echo ""
        echo "Commands:"
        echo "  install   - Install PM2 and start all services"
        echo "  start     - Start all FrontRow services"
        echo "  stop      - Stop all FrontRow services"
        echo "  restart   - Restart all FrontRow services"
        echo "  status    - Show status of all services"
        echo "  logs      - Show logs for all services"
        echo "  monitor   - Open PM2 monitoring dashboard"
        echo "  startup   - Configure services to start on boot"
        echo "  uninstall - Remove all services from PM2"
        echo ""
        exit 1
        ;;
esac

