import dotenv from 'dotenv';

dotenv.config();

interface FirebaseConfig {
  projectId: string;
  credentialsPath: string;
}

interface BotConfig {
  name: string;
  prefix: string;
  phone: string;
}

interface PermissionsConfig {
  ownerPhone: string;
  adminPhones: string[];
}

interface PointsConfig {
  name: string;
  perMessages: number;
  enabled: boolean;
}

interface FeaturesConfig {
  autoReadMessages: boolean;
  autoTyping: boolean;
  welcomeImages: boolean;
}

interface RateLimitConfig {
  maxCommandsPerMinute: number;
  maxWarnsPerDay: number;
}

interface MessagesConfig {
  saveEnabled: boolean;
  saveOnlyCommands: boolean;
}

interface LoggingConfig {
  level: string;
  nodeEnv: string;
}

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  welcomeBgUrl: string;
  matchBgUrl: string;
}

export interface AppConfig {
  firebase: FirebaseConfig;
  bot: BotConfig;
  permissions: PermissionsConfig;
  points: PointsConfig;
  features: FeaturesConfig;
  rateLimit: RateLimitConfig;
  messages: MessagesConfig;
  logging: LoggingConfig;
  cloudinary: CloudinaryConfig;
}

export const config: AppConfig = {
  // Firebase
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    credentialsPath: process.env.FIREBASE_CREDENTIALS_PATH || './firebase-credentials.json'
  },

  // Bot Configuration
  bot: {
    name: process.env.BOT_NAME || 'Bot Assistant',
    prefix: process.env.COMMAND_PREFIX || '.',
    phone: process.env.BOT_PHONE || ''
  },

  // Permisos
  permissions: {
    ownerPhone: process.env.OWNER_PHONE || '',
    adminPhones: (process.env.ADMIN_PHONES || '').split(',').filter(p => p.trim())
  },

  // Sistema de Puntos
  points: {
    name: process.env.POINTS_NAME || 'puntos',
    perMessages: parseInt(process.env.POINTS_PER_MESSAGES || '10', 10),
    enabled: process.env.POINTS_ENABLED === 'true'
  },

  // Features
  features: {
    autoReadMessages: process.env.AUTO_READ_MESSAGES === 'true',
    autoTyping: process.env.AUTO_TYPING === 'true',
    welcomeImages: process.env.WELCOME_IMAGES === 'true'
  },

  // Rate Limiting
  rateLimit: {
    maxCommandsPerMinute: parseInt(process.env.MAX_COMMANDS_PER_MINUTE || '20', 10),
    maxWarnsPerDay: parseInt(process.env.MAX_WARNS_PER_DAY || '5', 10)
  },

  // Message Saving Configuration
  messages: {
    saveEnabled: process.env.SAVE_MESSAGES_ENABLED !== 'false',
    saveOnlyCommands: process.env.SAVE_ONLY_COMMANDS === 'true'
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    nodeEnv: process.env.NODE_ENV || 'production'
  },

  // Cloudinary
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    welcomeBgUrl: process.env.WELCOME_BG_URL || '',
    matchBgUrl: process.env.MATCH_BG_URL || ''
  }
};

export default config;
