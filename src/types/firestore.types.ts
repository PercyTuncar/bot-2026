/**
 * Firestore Data Type Definitions
 */

import { Timestamp } from 'firebase-admin/firestore';

export interface GroupConfig {
  // Configuración de puntos a nivel raíz (formato simplificado usado por setmessagesperpoint)
  messagesPerPoint?: number;
  pointsName?: string;
  pointsEnabled?: boolean;

  // Configuración de puntos anidada (formato completo)
  points: {
    enabled: boolean;
    perMessages: number;
    name: string;
    messagesPerPoint?: number; // Alias para compatibilidad
  };
  moderation: {
    antiSpam: {
      enabled: boolean;
      maxMessages: number;
      timeWindow: number;
      action: 'delete' | 'warn' | 'kick';
    };
    antiLink: {
      enabled: boolean;
      action: 'delete' | 'warn' | 'kick';
      allowedDomains: string[];
    };
    bannedWords: {
      enabled: boolean;
      words: string[];
      action: 'delete' | 'warn' | 'kick';
    };
  };
  limits: {
    maxWarnings: number;
    autoKickOnMaxWarns: boolean;
  };
  welcome: {
    enabled: boolean;
    message: string;
    withImage: boolean;
    imageUrl?: string;
  };
  goodbye: {
    enabled: boolean;
    message: string;
  };
  levels?: LevelConfig[];
  bannedWords?: { // Added top-level alias for compatibility
    enabled: boolean;
    words: string[];
    action: 'delete' | 'warn' | 'kick';
  };
  antiLink?: { // Added top-level alias for compatibility
    enabled: boolean;
    action: 'delete' | 'warn' | 'kick';
    allowedDomains: string[];
  };
  bannedUsers?: string[];
  features?: {
    welcomeImages?: boolean;
  };
  rules?: string | string[];
}

export interface LevelConfig {
  level: number;
  name: string;
  minPoints: number;
  maxPoints: number;
  color: string;
  pointsRequired?: number; // Keep for compatibility if needed, or remove
  emoji?: string;
}

export interface GroupData {
  id: string;
  name: string;
  subject?: string; // Added subject
  description?: string;
  owner?: string;
  isActive: boolean;
  isBotAdmin: boolean;
  memberCount: number;
  adminCount: number;
  totalMessages: number;
  totalPoints: number;
  totalCommandsExecuted: number;
  totalPremiumCommandsPurchased: number;
  totalRedemptions: number;
  createdAt: Timestamp | string;
  activatedAt?: Timestamp | string;
  deactivatedAt?: Timestamp | string; // Added deactivatedAt
  lastActivityAt?: Timestamp | string;
  lastSyncAt?: Timestamp | string;
  updatedAt: Timestamp | string;
  config: GroupConfig;
  isReadOnly?: boolean;
  announce?: boolean;
  restrict?: boolean;
  inviteCode?: string;
  creationTimestamp?: number;
}

export interface MemberStats {
  totalPointsEarned: number;
  totalPointsSpent: number;
  totalRewardsRedeemed: number;
  firstMessageDate: Timestamp | string;
  averageMessagesPerDay: number;
  totalPointsSpentOnCommands?: number;
  totalPointsSpentOnRewards?: number;
  totalPremiumCommandsPurchased?: number;
  totalCommandsExecuted?: number;
  totalPremiumCommandsUsed?: number;
  longestStreak?: number;
  currentStreak?: number;
}

export interface WarnHistory {
  type?: 'WARN' | 'UNWARN' | 'KICK' | 'EXIT'; // Tipo de evento según documentación
  byPhone?: string;
  byName?: string;
  reason?: string;
  timestamp: Timestamp | string;
}

export interface MemberData {
  phone: string;
  lid?: string | null;
  displayName: string;
  name?: string;
  pushname?: string;
  shortName?: string;
  isMember: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  role: 'member' | 'admin' | 'superadmin';
  points: number;
  lifetimePoints: number;
  messageCount: number;
  totalMessagesCount: number;
  currentLevel: number;
  messagesForNextPoint: number;
  warnings: number;
  warnHistory: WarnHistory[];
  totalExits?: number; // Contador histórico de salidas según documentación
  totalKicks?: number; // Contador histórico de expulsiones
  lastExitAt?: Timestamp | string | null; // Fecha de última salida
  kickedAt?: Timestamp | string | null; // Fecha de última expulsión
  lastKickReason?: string | null; // Motivo de última expulsión
  lastKickBy?: string | null; // Admin que ejecutó la última expulsión
  lastKickByName?: string | null; // Nombre del admin
  createdAt: Timestamp | string;
  joinedAt: Timestamp | string;
  leftAt?: Timestamp | string | null;
  lastMessageAt?: Timestamp | string | null;
  lastActiveAt?: Timestamp | string | null; // Fecha de última actividad
  updatedAt: Timestamp | string;
  stats: MemberStats;
  isMe?: boolean;
  isUser?: boolean;
  isGroup?: boolean;
  isWAContact?: boolean;
  isMyContact?: boolean;
  isBlocked?: boolean;
  profilePicUrl?: string | null;
  premiumCommands?: string[];
  preferences?: any;
}

export interface MessageData {
  messageId: string;
  authorPhone: string;
  authorLid?: string | null;
  authorName: string;
  authorRole: 'member' | 'admin' | 'superadmin';
  body: string;
  type: string;
  hasMedia: boolean;
  isForwarded: boolean;
  isStarred: boolean;
  fromMe: boolean;
  hasQuotedMsg: boolean;
  quotedMsgId?: string | null;
  mentionedIds: string[];
  mentionedCount: number;
  links: string[];
  hasLinks: boolean;
  timestamp: Timestamp | string;
  wasDeleted: boolean;
  deletionReason?: string | null;
  deletedBy?: string | null;
  triggeredWarn: boolean;
  isCommand: boolean;
  commandName?: string | null;
}

export interface UserData {
  phone: string;
  name?: string;
  lastKnownName?: string; // Added
  firstSeen?: Timestamp | string; // Made optional
  lastSeen?: Timestamp | string; // Made optional
  groups?: string[]; // Added
  totalGroups?: number; // Made optional
  totalPoints?: number; // Made optional
  totalMessages?: number; // Made optional
  isGlobalBanned?: boolean; // Made optional
  banReason?: string | null;
  createdAt?: Timestamp | string; // Added
  updatedAt?: Timestamp | string; // Added
  isGlobalAdmin?: boolean; // Added
}

export interface PrizeData {
  id: string;
  code?: string; // Added code
  name: string;
  description: string;
  pointsRequired: number;
  points?: number; // Added alias
  quantity: number;
  claimedCount: number;
  isActive: boolean;
  createdBy: string;
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

export interface RequestData {
  id: string;
  userId: string;
  phone?: string; // Added phone
  groupId?: string; // Added groupId
  groupName?: string; // Added groupName
  userName: string;
  prizeId: string;
  prizeName: string;
  prizeCode?: string; // Added prizeCode
  pointsSpent: number;
  status: 'pending' | 'approved' | 'delivered' | 'rejected';
  requestedAt: Timestamp | string;
  approvedBy?: string;
  approvedAt?: Timestamp | string;
  deliveredBy?: string;
  deliveredAt?: Timestamp | string;
  rejectedBy?: string;
  rejectedAt?: Timestamp | string;
  rejectionReason?: string;
}

export interface RedemptionData {
  id: string;
  redemptionId: string;
  redemptionType: string;
  userPhone: string;
  userName: string;
  rewardId: string;
  rewardName: string;
  pointsCost: number;
  status: 'pending' | 'approved' | 'delivered' | 'rejected';
  requestedAt: Timestamp | string;
  approvedAt?: Timestamp | string; // Added alias for processedAt
  processedAt?: Timestamp | string;
  processedBy?: string;
  processedByName?: string;
  deliveredAt?: Timestamp | string;
  deliveredBy?: string;
  deliveryNotes?: string;
  rejectionReason?: string;
  userNotes?: string;
  emoji?: string;
}

export interface ConfigData {
  ownerPhone?: string;
  adminPhones?: string[];
  globalBannedUsers?: string[];
  defaultPrefix?: string;
  maintenanceMode?: boolean;
  updatedAt?: Timestamp | string;
}

export interface FindMemberResult {
  data: MemberData;
  foundBy: 'phone' | 'lid';
  docId: string;
}


