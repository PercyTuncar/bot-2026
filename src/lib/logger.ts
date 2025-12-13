import winston from 'winston';
import { config } from '../config/environment.js';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const logsDir = join(process.cwd(), 'logs');

if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Formato personalizado para consola (legible)
const consoleFormat = winston.format.printf(({ level, message, timestamp, service, ...meta }: any) => {
  const time = timestamp ? new Date(timestamp as string).toLocaleTimeString('es-ES') : new Date().toLocaleTimeString('es-ES');
  
  // Si el mensaje es un objeto, formatearlo mejor
  let formattedMessage: string = message as string;
  if (typeof message === 'object') {
    formattedMessage = JSON.stringify(message, null, 2);
  } else if (typeof message === 'string') {
    // Preservar saltos de línea en strings
    formattedMessage = message;
  }
  
  // Formatear metadata adicional
  let metaStr = '';
  if (Object.keys(meta).length > 0 && meta.service === undefined) {
    const cleanMeta = { ...meta };
    delete cleanMeta.service;
    if (Object.keys(cleanMeta).length > 0) {
      metaStr = '\n' + JSON.stringify(cleanMeta, null, 2);
    }
  }
  
  // Asegurar que los saltos de línea se muestren correctamente
  // Reemplazar \n por saltos de línea reales
  const finalMessage = typeof formattedMessage === 'string' 
    ? formattedMessage.replace(/\\n/g, '\n').replace(/\\r\\n/g, '\n')
    : formattedMessage;
  return `[${time}] ${level}: ${finalMessage}${metaStr}`;
});

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'whatsapp-bot' },
  transports: [
    new winston.transports.File({
      filename: join(logsDir, 'error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    new winston.transports.File({
      filename: join(logsDir, 'combined.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    new winston.transports.File({
      filename: join(logsDir, 'bot-activity.log'),
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

// Consola con formato legible siempre
logger.add(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      consoleFormat
    ),
    handleExceptions: true,
    handleRejections: true
  })
);

export default logger;
