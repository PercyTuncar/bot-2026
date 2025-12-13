export const COMMAND_PREFIX = '.';

export const PERMISSION_LEVELS = {
  USER: 0,
  GROUP_ADMIN: 1,
  GLOBAL_ADMIN: 2,
  OWNER: 3
} as const;

export const PERMISSION_NAMES: Record<number, string> = {
  0: 'user',
  1: 'group_admin',
  2: 'global_admin',
  3: 'owner'
};

export const COMMAND_SCOPES = {
  GROUP: 'group',
  DM: 'dm',
  ANY: 'any'
} as const;

export const REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DELIVERED: 'delivered',
  REJECTED: 'rejected'
} as const;

export const MEMBER_ROLES = {
  MEMBER: 'member',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin'
} as const;

export interface LevelConfig {
  level: number;
  name: string;
  minPoints: number;
  maxPoints: number;
  color: string;
}

export interface WelcomeGoodbyeConfig {
  enabled: boolean;
  message: string;
}

export interface AntiSpamConfig {
  enabled: boolean;
  maxMessages: number;
  interval: number;
}

export interface BannedWordsConfig {
  enabled: boolean;
  words: string[];
  action: 'warn' | 'delete' | 'kick';
}

export interface AntiLinkConfig {
  enabled: boolean;
  allowedDomains: string[];
  action: 'warn' | 'delete' | 'kick';
}

export interface DefaultGroupConfig {
  prefix: string;
  commandsEnabled: boolean;
  pointsName: string;
  messagesPerPoint: number;
  pointsEnabled: boolean;
  levels: LevelConfig[];
  welcome: WelcomeGoodbyeConfig;
  goodbye: WelcomeGoodbyeConfig;
  maxWarnings: number;
  autoKickOnMaxWarns: boolean;
  antiSpam: AntiSpamConfig;
  bannedWords: BannedWordsConfig;
  antiLink: AntiLinkConfig;
}

export const DEFAULT_GROUP_CONFIG: DefaultGroupConfig = {
  prefix: '.',
  commandsEnabled: true,
  pointsName: 'puntos',
  messagesPerPoint: 10,
  pointsEnabled: true,
  
  // Sistema de niveles
  levels: [
    { level: 1, name: "Newbie", minPoints: 0, maxPoints: 1999, color: "#808080" },
    { level: 2, name: "Regular", minPoints: 2000, maxPoints: 4999, color: "#0000FF" },
    { level: 3, name: "Veteran", minPoints: 5000, maxPoints: 9999, color: "#800080" },
    { level: 4, name: "Elite", minPoints: 10000, maxPoints: 19999, color: "#FFD700" },
    { level: 5, name: "Legend", minPoints: 20000, maxPoints: 999999999, color: "#FF0000" }
  ],
  
  welcome: {
    enabled: false,
    message: '¡Bienvenido {name} al grupo!'
  },
  goodbye: {
    enabled: false,
    message: 'Adiós {user}, esperamos verte pronto'
  },
  
  // Sistema de moderación
  maxWarnings: 3,
  autoKickOnMaxWarns: true,
  
  // Anti-spam
  antiSpam: {
    enabled: false,
    maxMessages: 5,
    interval: 10
  },
  
  // Palabras prohibidas
  bannedWords: {
    enabled: false,
    words: [],
    action: 'warn'
  },
  
  // Anti-link
  antiLink: {
    enabled: false,
    allowedDomains: [],
    action: 'delete'
  }
};

export const EMOJIS = {
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  LOADING: '⏳',
  TROPHY: '🏆',
  CROWN: '👑',
  MEDAL_1: '🥇',
  MEDAL_2: '🥈',
  MEDAL_3: '🥉',
  POINTS: '🎯',
  ROBOT: '🤖',
  PARTY: '🎉',
  SAD: '😢',
  PHONE: '📱',
  MESSAGE: '💬',
  USER: '👤',
  CALENDAR: '📅',
  CLOCK: '🕐',
  STAR: '⭐',
  FIRE: '🔥',
  CHART: '📊',
  GROUP: '👥',
  GIFT: '🎁',
  CHECK: '✔️',
  CROSS: '✖️'
} as const;

export default {
  COMMAND_PREFIX,
  PERMISSION_LEVELS,
  PERMISSION_NAMES,
  COMMAND_SCOPES,
  REQUEST_STATUS,
  MEMBER_ROLES,
  DEFAULT_GROUP_CONFIG,
  EMOJIS
};
