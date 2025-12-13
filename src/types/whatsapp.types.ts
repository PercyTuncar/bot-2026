/**
 * WhatsApp Web.js Type Definitions
 */

export interface WAMessage {
  id: {
    id: string;
    _serialized: string;
    fromMe?: boolean;
  };
  from: string;
  to: string;
  author?: string;
  body: string;
  type: string;
  timestamp: number;
  hasMedia: boolean;
  fromMe: boolean;
  isForwarded?: boolean;
  isStarred?: boolean;
  hasQuotedMsg?: boolean;
  mentionedIds?: string[];
  _data?: {
    quotedMsg?: {
      id: string;
    };
    participant?: string;
    from?: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
  };
  react?: (emoji: string) => Promise<void>;
  delete?: (forEveryone: boolean) => Promise<void>;
}

export interface WAContact {
  id: {
    _serialized: string;
    user: string;
    server: string;
  };
  number: string;
  pushname?: string;
  name?: string;
  shortName?: string;
  isMe: boolean;
  isUser: boolean;
  isGroup: boolean;
  isWAContact: boolean;
  isMyContact: boolean;
  isBlocked: boolean;
  profilePicUrl?: string;
}

export interface WAGroupParticipant {
  id: {
    _serialized: string;
    user: string;
    server: string;
  };
  isAdmin: boolean;
  isSuperAdmin: boolean;
  notify?: string;
  name?: string;
}

export interface WAGroupChat {
  id: {
    _serialized: string;
    user: string;
    server: string;
  };
  name: string;
  isGroup: boolean;
  isReadOnly: boolean;
  announce?: boolean;
  restrict?: boolean;
  participants: WAGroupParticipant[];
  owner?: {
    _serialized: string;
  };
  createdAt?: number;
  timestamp?: number;
  description?: string;
  inviteCode?: string;
  groupMetadata?: {
    id: string;
    subject: string;
    desc?: string;
    participants: WAGroupParticipant[];
  };
  getChatById?: (id: string) => Promise<WAGroupChat>;
  removeParticipants?: (participants: string[]) => Promise<void>;
}

export interface WAClient {
  info: {
    wid: {
      user: string;
      _serialized: string;
    };
    pushname: string;
    platform: string;
  };
  on: (event: string, callback: (...args: any[]) => void) => void;
  sendMessage: (to: string, content: string, options?: any) => Promise<any>;
  getContactById: (id: string) => Promise<WAContact>;
  getChatById: (id: string) => Promise<WAGroupChat>;
  getChats: () => Promise<WAGroupChat[]>;
  destroy: () => Promise<void>;
}

export interface WAGroupParticipantsUpdate {
  id: {
    _serialized: string;
  };
  participants: string[];
  action: 'add' | 'remove' | 'promote' | 'demote';
}

export interface WAGroupUpdate {
  id: {
    _serialized: string;
  };
  subject?: string;
  desc?: string;
  announce?: boolean;
  restrict?: boolean;
}
