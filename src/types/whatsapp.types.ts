/**
 * WhatsApp Type Definitions (Baileys Compatible)
 * Migrated from whatsapp-web.js to @whiskeysockets/baileys
 */

import { WASocket, proto, GroupMetadata, GroupParticipant, Contact } from '@whiskeysockets/baileys';

// Re-export Baileys types
export type { WASocket, proto, GroupMetadata, GroupParticipant, Contact };

// Compatible message interface (used by existing commands)
export interface WAMessage {
  id: {
    id: string;
    _serialized: string;
    fromMe?: boolean;
  };
  key?: proto.IMessageKey;
  message?: proto.IMessage;
  from: string;
  to: string;
  author?: string;
  body: string;
  type: string;
  timestamp: number;
  hasMedia: boolean;
  fromMe: boolean;
  pushName?: string;
  isForwarded?: boolean;
  isStarred?: boolean;
  hasQuotedMsg?: boolean;
  mentionedIds?: string[];
  _data?: {
    quotedMsg?: {
      id: string;
      participant?: string;
      message?: proto.IMessage;
    };
    participant?: string;
    from?: string;
    pushName?: string;
  };

  // Methods provided by EventHandler compatibility layer
  react?: (emoji: string) => Promise<void>;
  delete?: (forEveryone: boolean) => Promise<void>;
  getChat?: () => Promise<any>;
  getQuotedMessage?: () => Promise<any>;
  getContact?: () => Promise<any>;
}

export interface WAContact {
  id: {
    _serialized: string;
    user: string;
    server?: string;
  };
  number: string;
  pushname?: string;
  name?: string;
  shortName?: string;
  isMe?: boolean;
  isUser?: boolean;
  isGroup?: boolean;
  isWAContact?: boolean;
  isMyContact?: boolean;
  isBlocked?: boolean;
  profilePicUrl?: string;
}

export interface WAGroupParticipant {
  id: string;
  admin?: 'admin' | 'superadmin' | null;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  notify?: string;
  name?: string;
}

export interface WAGroupChat {
  id: string;
  subject: string;
  name?: string;
  isGroup: boolean;
  isReadOnly?: boolean;
  announce?: boolean;
  restrict?: boolean;
  participants: WAGroupParticipant[];
  owner?: string;
  creation?: number;
  desc?: string;
  descId?: string;
  size?: number;
}

export interface WAClient {
  user?: {
    id: string;
    name?: string;
  };
  sendMessage: (jid: string, content: any) => Promise<any>;
  groupMetadata: (jid: string) => Promise<GroupMetadata>;
  groupParticipantsUpdate: (jid: string, participants: string[], action: 'add' | 'remove' | 'promote' | 'demote') => Promise<any>;
  profilePictureUrl: (jid: string, type?: 'image' | 'preview') => Promise<string | undefined>;
  sendPresenceUpdate: (type: 'composing' | 'paused' | 'recording', jid: string) => Promise<void>;
  onWhatsApp: (...jids: string[]) => Promise<{ exists: boolean; jid: string; name?: string }[]>;
}

export interface WAGroupParticipantsUpdate {
  id: string;
  participants: string[];
  action: 'add' | 'remove' | 'promote' | 'demote';
}

export interface WAGroupUpdate {
  id: string;
  subject?: string;
  desc?: string;
  announce?: boolean;
  restrict?: boolean;
}
