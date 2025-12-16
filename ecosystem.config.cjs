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
      
      // Auto-restart configuración
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '500M',
      
      // Reintentos de inicio si falla
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
      
      // Manejo de errores
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      
      // Variables de entorno
      env: {
        NODE_ENV: 'production',
        ...process.env
      },
      
      // Configuración de logs
      log_type: 'raw',
      time: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      
      // Ignorar carpetas en watch
      ignore_watch: [
        'node_modules', 
        'baileys_auth',
        'baileys_contacts_store.json',
        'logs', 
        'temp',
        '.git'
      ],
      
      // Desactivar monitoreo de recursos para Linux/Windows
      pmx: false,
      monitoring: false,
      
      // Comandos de ciclo de vida
      kill_timeout: 5000,
      listen_timeout: 3000,
      shutdown_with_message: false
    }
  ]
};

