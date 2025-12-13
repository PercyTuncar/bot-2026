﻿import { parseCommand } from '../utils/parser.js';
import { isValidCommand } from '../utils/validator.js';
import { config } from '../config/environment.js';
import { normalizeGroupId } from '../utils/phone.js';
import logger from '../lib/logger.js';

export class MessageRouter {
  /**
   * Determina si un mensaje es un comando
   */
  static isCommand(text) {
    return isValidCommand(text, config.bot.prefix);
  }

  /**
   * Enruta un mensaje
   */
  static async route(msg) {
    const text = msg.body || '';
    let chat = null;
    try {
      chat = await msg.getChat();
    } catch (error) {
      // no-op
    }

    const isGroup = !!chat?.isGroup || (msg.from?.endsWith('@g.us') ?? false);
    const rawGroupId = isGroup ? (chat?.id?._serialized || msg.from) : null;
    const groupId = rawGroupId ? normalizeGroupId(rawGroupId) : null;

    logger.info(`isGroup=${isGroup}, groupId=${groupId || 'null'}, rawId=${rawGroupId || msg.from}`);

    const isDM = !isGroup;
    const isCommand = this.isCommand(text);

    return {
      text,
      isGroup,
      isDM,
      isCommand,
      groupId,
      rawGroupId,
      parsed: isCommand ? parseCommand(text) : null
    };
  }
}

export default MessageRouter;
