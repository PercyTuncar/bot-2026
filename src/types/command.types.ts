/**
 * Command System Type Definitions
 */

import { WAClient, WAMessage } from './whatsapp.types.js';

export type CommandCategory = 
  | 'general' 
  | 'admin' 
  | 'owner' 
  | 'points' 
  | 'stats' 
  | 'moderation' 
  | 'prizes'
  | 'premium'
  | 'utility';

export type PermissionLevel = 
  | 'user' 
  | 'group_admin' 
  | 'global_admin' 
  | 'owner';

export type CommandScope = 
  | 'group' 
  | 'dm' 
  | 'both';

export interface CommandContext {
  sock: WAClient;
  msg: WAMessage;
  args: string[];
  groupId: string;
  groupJid: string;
  userPhone: string;
  replyJid: string;
}

export interface Command {
  name: string;
  description: string;
  usage?: string;
  aliases?: string[];
  category: CommandCategory;
  permissions: PermissionLevel;
  scope: CommandScope;
  cooldown?: number;
  enabled?: boolean;
  pointsRequired?: number;      // Puntos mínimos necesarios para usar (NO se gastan)
  purchaseRequired?: boolean;   // Si true, el usuario debe haber comprado el comando premium
  execute: (context: CommandContext) => Promise<void>;
}

export interface ParsedCommand {
  command: string;
  args: string[];
  rawText: string;
}

export interface RouteResult {
  isGroup: boolean;
  isDM: boolean;
  groupId: string;
  rawGroupId: string;
  replyJid: string;
  isCommand: boolean;
  parsed: ParsedCommand | null;
}

export interface PermissionCheckResult {
  level: number;
  name: string;
}
