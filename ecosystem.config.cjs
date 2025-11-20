/**
 * PM2 Ecosystem Configuration for Production
 * 
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart ecosystem.config.cjs --update-env
 *   pm2 logs novaenglish-api
 *   pm2 monit
 * 
 * Auto-start on server reboot:
 *   pm2 startup
 *   pm2 save
 */

module.exports = {
  apps: [{
    name: 'novaenglish-api',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: './',
    
    // Instance configuration
    instances: 1, // Single instance (scale up if needed)
    exec_mode: 'fork', // Use 'cluster' for multiple instances
    
    // Auto-restart configuration
    autorestart: true,
    watch: false, // Set to true only in development
    max_memory_restart: '1G', // Restart if memory exceeds 1GB
    
    // Environment variables
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 3001, // Auto-detected from Dewacloud
    },
    
    // Error handling
    min_uptime: '10s', // Minimum uptime before considering started
    max_restarts: 10, // Max restarts within restart_delay window
    restart_delay: 4000, // Delay between restarts (ms)
    
    // Logging
    error_file: 'logs/error.log',
    out_file: 'logs/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Advanced settings
    kill_timeout: 5000, // Time to wait for graceful shutdown
    listen_timeout: 3000, // Time to wait for app to listen
    
    // Post-deploy hooks (optional)
    // post_update: ['npm install', 'npm run build'],
  }],
  
  // Deploy configuration (optional, if using PM2 deploy)
  // deploy: {
  //   production: {
  //     user: 'node',
  //     host: 'your-server.com',
  //     ref: 'origin/main',
  //     repo: 'git@github.com:username/repo.git',
  //     path: '/var/www/production',
  //     'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.cjs --env production'
  //   }
  // }
};
