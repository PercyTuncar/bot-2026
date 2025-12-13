const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
  apps: [
    {
      name: 'whatsapp-bot',
      script: 'dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        ...process.env
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
      // Usar formato crudo para que el QR conserve saltos de línea
      log_type: 'raw',
      ignore_watch: ['node_modules', '.wwebjs_auth', '.wwebjs_cache', 'logs', 'temp'],
      // Desactivar monitoreo de recursos para evitar errores de wmic en Windows
      pmx: false,
      // Desactivar recolección de métricas de sistema (previene error wmic)
      monitoring: false
    }
  ]
};

