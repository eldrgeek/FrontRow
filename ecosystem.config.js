/**
 * PM2 Ecosystem Configuration for FrontRow
 * =========================================
 * 
 * This configuration file manages all FrontRow services with PM2.
 * 
 * Usage:
 *   pm2 start ecosystem.config.js              # Start all services
 *   pm2 start ecosystem.config.js --only backend   # Start only backend
 *   pm2 stop all                               # Stop all services
 *   pm2 restart all                            # Restart all services
 *   pm2 logs                                   # View logs for all services
 *   pm2 logs backend                           # View logs for backend only
 *   pm2 monit                                  # Monitor all services
 *   pm2 list                                   # List all services
 *   pm2 delete all                             # Remove all services from PM2
 * 
 * To start services on system boot:
 *   pm2 startup                                # Generate startup script
 *   pm2 save                                   # Save current process list
 */

module.exports = {
  apps: [
    {
      name: 'backend',
      cwd: './server',
      script: 'index.js',
      env: {
        NODE_ENV: 'development',
        ENABLE_TEST_ENDPOINTS: 'true',
        PORT: 3001
      },
      instances: 1,
      autorestart: true,
      watch: false,  // Set to true if you want auto-reload on file changes
      max_memory_restart: '500M',
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true
    },
    {
      name: 'frontend',
      cwd: './front-row-vite',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development',
        PORT: 5173
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true
    },
    {
      name: 'modal',
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
      max_memory_restart: '1G',
      error_file: './logs/modal-error.log',
      out_file: './logs/modal-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true
    },
    {
      name: 'mcp-server',
      cwd: './',
      script: 'python',
      args: 'mcp_modal_server.py --host 127.0.0.1 --port 8001 --modal-url http://localhost:3001',
      interpreter: 'none',  // Don't use PM2's default Node.js interpreter
      env: {
        PYTHONUNBUFFERED: '1'  // Ensure Python output is not buffered
      },
      instances: 1,
      autorestart: true,
      watch: false,  // Set to ['mcp_modal_server.py'] if you want auto-reload
      max_memory_restart: '500M',
      error_file: './logs/mcp-server-error.log',
      out_file: './logs/mcp-server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true
    }
  ]
};

