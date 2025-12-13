import dotenv from 'dotenv';
dotenv.config();
export const config = {
    firebase: {
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        credentialsPath: process.env.FIREBASE_CREDENTIALS_PATH || './firebase-credentials.json'
    },
    bot: {
        name: process.env.BOT_NAME || 'Bot Assistant',
        prefix: process.env.COMMAND_PREFIX || '.',
        phone: process.env.BOT_PHONE || ''
    },
    permissions: {
        ownerPhone: process.env.OWNER_PHONE || '',
        adminPhones: (process.env.ADMIN_PHONES || '').split(',').filter(p => p.trim())
    },
    points: {
        name: process.env.POINTS_NAME || 'puntos',
        perMessages: parseInt(process.env.POINTS_PER_MESSAGES || '10', 10),
        enabled: process.env.POINTS_ENABLED === 'true'
    },
    features: {
        autoReadMessages: process.env.AUTO_READ_MESSAGES === 'true',
        autoTyping: process.env.AUTO_TYPING === 'true',
        welcomeImages: process.env.WELCOME_IMAGES === 'true'
    },
    rateLimit: {
        maxCommandsPerMinute: parseInt(process.env.MAX_COMMANDS_PER_MINUTE || '20', 10),
        maxWarnsPerDay: parseInt(process.env.MAX_WARNS_PER_DAY || '5', 10)
    },
    messages: {
        saveEnabled: process.env.SAVE_MESSAGES_ENABLED !== 'false',
        saveOnlyCommands: process.env.SAVE_ONLY_COMMANDS === 'true'
    },
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        nodeEnv: process.env.NODE_ENV || 'production'
    },
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
        apiKey: process.env.CLOUDINARY_API_KEY || '',
        apiSecret: process.env.CLOUDINARY_API_SECRET || '',
        welcomeBgUrl: process.env.WELCOME_BG_URL || ''
    }
};
export default config;
