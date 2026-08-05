module.exports = {
  apps: [
    {
      name: 'timesheet-server',
      script: 'src/index.js',
      instances: 'max',          // use all CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
      // Restart if memory exceeds 300MB
      max_memory_restart: '300M',
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 3000,
      // Logs
      error_file: '/dev/stderr',
      out_file: '/dev/stdout',
      merge_logs: true,
      // Auto-restart on crash (max 10 restarts in 60s)
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
