export default {
  apps: [{
    name: 'campaign',
    script: 'server.js',
    cwd: '.',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    min_uptime: 5000,
    env: {
      NODE_ENV: 'production'
    }
  }]
}