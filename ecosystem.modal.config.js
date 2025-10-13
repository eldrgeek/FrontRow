/**
 * PM2 Ecosystem Configuration for FrontRow Modal System (Background Services)
 * ==========================================================================
 * 
 * This configuration manages only the background services needed for 
 * AI/Claude to interact with the modal system:
 *   - Backend Server (port 3001) - Modal communication endpoint
 *   - Modal App (port 5174) - The desktop modal application
 *   - MCP Server (port 8001) - AI integration layer
 * 
 * Usage:
 *   pm2 start ecosystem.modal.config.js        # Start modal system
 *   pm2 stop modal-system                      # Stop all modal services
 *   pm2 restart modal-system                   # Restart all modal services
 *   pm2 logs modal-system                      # View logs
 *   pm2 monit                                  # Monitor services
 * 
 * To start on system boot:
 *   pm2 startup                                # Generate startup script (run once)
 *   pm2 save                                   # Save current process list
 */

module.exports = {
  apps: [
    {
      name: 'modal-backend',
      cwd: './server',
      script: 'index.js',
      env: {
        NODE_ENV: 'development',
        ENABLE_TEST_ENDPOINTS: 'true',
        PORT: 3001
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      error_file: './logs/modal-backend-error.log',
      out_file: './logs/modal-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
      namespace: 'modal-system'
    },
    {
      name: 'modal-app',
      cwd: './packages/modal-app',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development',
        PORT: 5174
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: './logs/modal-app-error.log',
      out_file: './logs/modal-app-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
      namespace: 'modal-system'
    },
    {
      name: 'mcp-server',
      cwd: './',
      script: 'python',
      args: 'mcp_modal_server.py --host 127.0.0.1 --port 8001 --modal-url http://localhost:3001',
      interpreter: 'none',
      env: {
        PYTHONUNBUFFERED: '1'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      error_file: './logs/mcp-server-error.log',
      out_file: './logs/mcp-server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
      namespace: 'modal-system'
    }
  ]
};

