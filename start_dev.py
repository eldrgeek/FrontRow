#!/usr/bin/env python3
"""
FrontRow Development Environment Starter
=======================================

This script starts the development servers for the FrontRow application with
different modes for basic and full development environments.

Usage:
    python start_dev.py                    # Basic mode (backend + frontend + modal)
    python start_dev.py --full             # Full mode (includes MCP server)
    python start_dev.py --mcp-only         # Only start MCP server
    python start_dev.py --help             # Show help

Features:
- Cross-platform compatibility
- Proper process management and cleanup
- Colored output for better UX
- Graceful shutdown handling
- Command-line options for different modes
"""

import os
import sys
import subprocess
import signal
import time
import threading
import argparse
from pathlib import Path
from typing import List, Dict, Optional
import atexit
import hashlib

# ANSI color codes for terminal output
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    BLUE = '\033[0;34m'
    YELLOW = '\033[1;33m'
    PURPLE = '\033[0;35m'
    CYAN = '\033[0;36m'
    ORANGE = '\033[0;33m'
    NC = '\033[0m'  # No Color

class DevServerManager:
    """Manages the development servers for FrontRow."""
    
    def __init__(self, mode: str = 'basic'):
        self.project_root = Path(__file__).parent.absolute()
        self.processes: List[subprocess.Popen] = []
        self.running = True
        self.mode = mode
        self.mcp_process: Optional[subprocess.Popen] = None
        self.mcp_file_hashes: Dict[str, str] = {}
        self.mcp_watcher_thread: Optional[threading.Thread] = None
        
        # Server configurations
        self.servers = {
            'backend': {
                'name': 'Backend Server (Node.js + Socket.IO)',
                'path': self.project_root / 'server',
                'command': ['npm', 'start'],
                'color': Colors.BLUE,
                'port': 3001,
                'url': 'http://localhost:3001/',
                'enabled': True,
                'env': {
                    'NODE_ENV': 'development',
                    'ENABLE_TEST_ENDPOINTS': 'true'
                }
            },
            'frontend': {
                'name': 'Frontend Server (Vite + TypeScript)',
                'path': self.project_root / 'front-row-vite',
                'command': ['npm', 'run', 'dev'],
                'color': Colors.GREEN,
                'port': 5173,
                'url': 'http://localhost:5173/',
                'enabled': True
            },
            'modal': {
                'name': 'Modal App (Vite + Electron)',
                'path': self.project_root / 'packages' / 'modal-app',
                'command': ['npm', 'run', 'dev'],
                'color': Colors.CYAN,
                'port': 5174,
                'url': 'http://localhost:5174/',
                'enabled': True
            },
            'mcp': {
                'name': 'Modal MCP Server',
                'path': self.project_root,
                'command': ['python', 'mcp_modal_server.py', '--host', '127.0.0.1', '--port', '8001', '--modal-url', 'http://localhost:3001'],
                'color': Colors.ORANGE,
                'port': 8001,
                'url': 'http://localhost:8001/',
                'enabled': mode == 'full' or mode == 'mcp-only'
            }
        }
        
        # Disable non-MCP servers in mcp-only mode
        if mode == 'mcp-only':
            for server_key in ['backend', 'frontend', 'modal']:
                self.servers[server_key]['enabled'] = False
        
        # Set up signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        atexit.register(self.cleanup)
        
        # Initialize MCP file watcher if MCP server is enabled
        if self.servers['mcp']['enabled']:
            self._init_mcp_file_watcher()
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals."""
        print(f"\n{Colors.YELLOW}🛑 Received shutdown signal. Stopping all servers...{Colors.NC}")
        self.running = False
        self.cleanup()
        print(f"{Colors.GREEN}✅ All servers stopped. Exiting...{Colors.NC}")
        # Force exit to ensure we actually terminate
        os._exit(0)
    
    def print_banner(self):
        """Print the startup banner."""
        mode_text = {
            'basic': 'Basic Development Environment',
            'full': 'Full Development Environment (Default)',
            'mcp-only': 'MCP Server Only'
        }
        print(f"{Colors.YELLOW}🚀 Starting FRONT ROW {mode_text.get(self.mode, 'Development Environment')}...{Colors.NC}")
        print()
    
    def print_status(self):
        """Print server status information."""
        print(f"{Colors.YELLOW}✅ All servers are starting up!{Colors.NC}")
        print()
        
        # Print enabled servers
        enabled_servers = {k: v for k, v in self.servers.items() if v['enabled']}
        
        for server_key, config in enabled_servers.items():
            if server_key == 'frontend':
                print(f"{Colors.GREEN}🌐 Frontend (Vite):{Colors.NC}     {config['url']}")
                print(f"{Colors.GREEN}🔗 Artist Mode:{Colors.NC}          {config['url']}?role=artist")
            elif server_key == 'backend':
                print(f"{Colors.BLUE}⚙️  Backend API:{Colors.NC}          {config['url']} (Test endpoints enabled)")
            elif server_key == 'modal':
                print(f"{Colors.CYAN}🖥️  Modal App:{Colors.NC}           {config['url']} (Vite) + Desktop App")
            elif server_key == 'mcp':
                print(f"{Colors.ORANGE}🤖 Modal MCP Server:{Colors.NC}     {config['url']}")
        
        print()
        print(f"{Colors.YELLOW}📋 Server Status:{Colors.NC}")
        for server_key, config in enabled_servers.items():
            if server_key == 'modal':
                print(f"   Modal App:              {Colors.GREEN}Port {config['port']} + Desktop{Colors.NC}")
            else:
                server_name = config['name'].split('(')[0].strip()
                print(f"   {server_name}:        {Colors.GREEN}Port {config['port']}{Colors.NC}")
        
        print()
        
        # Print testing information for full mode (now default)
        if self.mode == 'full':
            print(f"{Colors.YELLOW}🧪 Testing:{Colors.NC}")
            print(f"   Test MCP Server:        {Colors.CYAN}python test_modal_mcp.py{Colors.NC}")
            print(f"   Test Modal App:         {Colors.CYAN}python packages/modal-app/test-modal.py{Colors.NC}")
            print()
            print(f"{Colors.YELLOW}🔄 Auto-restart:{Colors.NC}")
            print(f"   MCP Server:             {Colors.GREEN}Auto-restarts on file changes{Colors.NC}")
            print()
        
        print(f"{Colors.YELLOW}Press Ctrl+C to stop all servers{Colors.NC}")
        print()
    
    def check_dependencies(self) -> bool:
        """Check if required dependencies are available."""
        print(f"{Colors.ORANGE}🔍 Checking dependencies...{Colors.NC}")
        
        # Check if npm is available (needed for Node.js servers)
        if any(self.servers[key]['enabled'] for key in ['backend', 'frontend', 'modal']):
            try:
                subprocess.run(['npm', '--version'], check=True, capture_output=True)
            except (subprocess.CalledProcessError, FileNotFoundError):
                print(f"{Colors.RED}❌ npm is not installed or not in PATH{Colors.NC}")
                return False
            
            # Check if Node.js is available
            try:
                subprocess.run(['node', '--version'], check=True, capture_output=True)
            except (subprocess.CalledProcessError, FileNotFoundError):
                print(f"{Colors.RED}❌ Node.js is not installed or not in PATH{Colors.NC}")
                return False
        
        # Check if Python dependencies are available (needed for MCP server)
        if self.servers['mcp']['enabled']:
            try:
                subprocess.run(['python', '-c', 'import fastmcp, uvicorn, aiohttp, websockets'], 
                             check=True, capture_output=True)
            except (subprocess.CalledProcessError, FileNotFoundError):
                print(f"{Colors.YELLOW}📦 Installing MCP dependencies...{Colors.NC}")
                try:
                    subprocess.run(['pip', 'install', '-r', str(self.project_root / 'requirements_modal_mcp.txt')], 
                                 check=True)
                except subprocess.CalledProcessError:
                    print(f"{Colors.RED}❌ Failed to install MCP dependencies{Colors.NC}")
                    return False
        
        return True
    
    def start_server(self, server_key: str) -> Optional[subprocess.Popen]:
        """Start a single server."""
        server_config = self.servers[server_key]
        
        if not server_config['enabled']:
            return None
        
        print(f"{server_config['color']}{server_config['name']}...{Colors.NC}")
        
        try:
            # Change to the server directory
            os.chdir(server_config['path'])
            
            # Prepare environment variables
            env = os.environ.copy()
            if 'env' in server_config:
                env.update(server_config['env'])
            
            # Start the server process
            process = subprocess.Popen(
                server_config['command'],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True,
                env=env
            )
            
            # Store the process
            self.processes.append(process)
            
            # Track MCP process separately for restart functionality
            if server_key == 'mcp':
                self.mcp_process = process
            
            # Start a thread to monitor the process output
            threading.Thread(
                target=self._monitor_process,
                args=(process, server_config['name'], server_config['color']),
                daemon=True
            ).start()
            
            return process
            
        except Exception as e:
            print(f"{Colors.RED}❌ Failed to start {server_config['name']}: {e}{Colors.NC}")
            return None
    
    def _monitor_process(self, process: subprocess.Popen, name: str, color: str):
        """Monitor a process and print its output."""
        try:
            for line in iter(process.stdout.readline, ''):
                if line:
                    # Add a prefix to identify the server
                    prefix = f"{color}[{name}]{Colors.NC}"
                    print(f"{prefix} {line.rstrip()}")
        except Exception as e:
            print(f"{Colors.RED}❌ Error monitoring {name}: {e}{Colors.NC}")
    
    def start_all_servers(self):
        """Start all enabled development servers."""
        if not self.check_dependencies():
            return False
        
        print()
        
        # Start each enabled server
        for server_key in self.servers.keys():
            process = self.start_server(server_key)
            if process is None:  # Server is disabled
                continue
            if not process:
                print(f"{Colors.RED}❌ Failed to start {server_key} server{Colors.NC}")
                return False
            
            # Small delay between server starts
            time.sleep(0.5)
        
        return True
    
    def wait_for_servers(self):
        """Wait for all servers to complete."""
        try:
            # Wait for all processes
            for process in self.processes:
                process.wait()
        except KeyboardInterrupt:
            pass
    
    def cleanup(self):
        """Clean up all running processes."""
        if not self.processes:
            return
        
        print(f"{Colors.YELLOW}🛑 Shutting down servers...{Colors.NC}")
        
        for process in self.processes:
            try:
                if process.poll() is None:  # Process is still running
                    process.terminate()
                    # Give it a moment to terminate gracefully
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()  # Force kill if it doesn't terminate
            except Exception as e:
                print(f"{Colors.RED}❌ Error stopping process: {e}{Colors.NC}")
        
        self.processes.clear()
        
        # Stop MCP file watcher
        if self.mcp_watcher_thread and self.mcp_watcher_thread.is_alive():
            self.running = False
            self.mcp_watcher_thread.join(timeout=2)
        
        # Clean up MCP process
        if self.mcp_process:
            try:
                if self.mcp_process.poll() is None:
                    self.mcp_process.terminate()
                    try:
                        self.mcp_process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        self.mcp_process.kill()
            except Exception as e:
                print(f"{Colors.RED}❌ Error stopping MCP process: {e}{Colors.NC}")
            self.mcp_process = None
    
    def _init_mcp_file_watcher(self):
        """Initialize the MCP file watcher."""
        # Files to monitor for changes
        self.mcp_files_to_watch = [
            self.project_root / 'mcp_modal_server.py',
            self.project_root / 'requirements_modal_mcp.txt'
        ]
        
        # Calculate initial file hashes
        for file_path in self.mcp_files_to_watch:
            if file_path.exists():
                self.mcp_file_hashes[str(file_path)] = self._calculate_file_hash(file_path)
        
        # Start the file watcher thread
        self.mcp_watcher_thread = threading.Thread(target=self._watch_mcp_files, daemon=True)
        self.mcp_watcher_thread.start()
    
    def _calculate_file_hash(self, file_path: Path) -> str:
        """Calculate MD5 hash of a file."""
        try:
            with open(file_path, 'rb') as f:
                return hashlib.md5(f.read()).hexdigest()
        except Exception:
            return ""
    
    def _watch_mcp_files(self):
        """Watch MCP server files for changes and restart when needed."""
        while self.running:
            try:
                for file_path in self.mcp_files_to_watch:
                    if not file_path.exists():
                        continue
                    
                    current_hash = self._calculate_file_hash(file_path)
                    stored_hash = self.mcp_file_hashes.get(str(file_path), "")
                    
                    if current_hash != stored_hash:
                        print(f"{Colors.ORANGE}🔄 MCP file changed: {file_path.name}{Colors.NC}")
                        self._restart_mcp_server()
                        # Update the hash
                        self.mcp_file_hashes[str(file_path)] = current_hash
                        break
                
                # Check every 2 seconds
                time.sleep(2)
                
            except Exception as e:
                print(f"{Colors.RED}❌ Error in MCP file watcher: {e}{Colors.NC}")
                time.sleep(5)  # Wait longer on error
    
    def _restart_mcp_server(self):
        """Restart the MCP server."""
        if not self.mcp_process:
            return
        
        print(f"{Colors.ORANGE}🔄 Restarting MCP server...{Colors.NC}")
        
        try:
            # Terminate the current MCP process
            if self.mcp_process.poll() is None:
                self.mcp_process.terminate()
                try:
                    self.mcp_process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.mcp_process.kill()
            
            # Remove from processes list
            if self.mcp_process in self.processes:
                self.processes.remove(self.mcp_process)
            
            # Wait a moment for cleanup
            time.sleep(1)
            
            # Start a new MCP server
            new_process = self.start_server('mcp')
            if new_process:
                self.mcp_process = new_process
                print(f"{Colors.GREEN}✅ MCP server restarted successfully{Colors.NC}")
            else:
                print(f"{Colors.RED}❌ Failed to restart MCP server{Colors.NC}")
                
        except Exception as e:
            print(f"{Colors.RED}❌ Error restarting MCP server: {e}{Colors.NC}")

def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="FrontRow Development Environment Starter",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python start_dev.py              # Full mode (backend + frontend + modal + MCP server) - DEFAULT
  python start_dev.py --basic      # Basic mode (backend + frontend + modal, no MCP server)
  python start_dev.py --full       # Full mode (includes MCP server)
  python start_dev.py --mcp-only   # Only start MCP server
        """
    )
    
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        '--basic',
        action='store_true',
        help='Start basic development environment (backend + frontend + modal, no MCP server)'
    )
    mode_group.add_argument(
        '--full',
        action='store_true',
        help='Start full development environment (includes MCP server) - DEFAULT'
    )
    mode_group.add_argument(
        '--mcp-only',
        action='store_true',
        help='Start only the MCP server'
    )
    
    return parser.parse_args()

def main():
    """Main entry point."""
    args = parse_arguments()
    
    # Determine mode - default to 'full' to include MCP server
    if args.mcp_only:
        mode = 'mcp-only'
    elif args.full:
        mode = 'full'
    elif args.basic:
        mode = 'basic'
    else:
        mode = 'full'  # Changed default from 'basic' to 'full'
    
    manager = DevServerManager(mode)
    
    try:
        manager.print_banner()
        
        if manager.start_all_servers():
            manager.print_status()
            manager.wait_for_servers()
        else:
            print(f"{Colors.RED}❌ Failed to start one or more servers{Colors.NC}")
            sys.exit(1)
            
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}🛑 Interrupted by user{Colors.NC}")
        manager.cleanup()
        print(f"{Colors.GREEN}✅ All servers stopped. Exiting...{Colors.NC}")
        os._exit(0)
    except Exception as e:
        print(f"{Colors.RED}❌ Unexpected error: {e}{Colors.NC}")
        manager.cleanup()
        sys.exit(1)
    finally:
        manager.cleanup()

if __name__ == "__main__":
    main() 