module.exports = {
  apps: [
    {
      name: "mcp-fileserver",
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        TRANSPORT: "http",
        PORT: 3000,
        WORKSPACE_ROOT: "./workspace"
      },
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    }
  ]
};
