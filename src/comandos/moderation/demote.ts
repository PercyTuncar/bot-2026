
import { getTargetUser } from '../../utils/parser.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';

export default {
  name: 'demote',
  description: 'Quitar permisos de administrador a un usuario',
  category: 'moderation',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 5,

  async execute({ sock, msg, replyJid }) {
    let chat = null;
    try {
      chat = await msg.getChat();
    } catch (e) {
      logger.warn(`[DEMOTE] Could not get chat: ${e.message}`);
    }

    const target = await getTargetUser(msg, chat);
    
    if (!target) {
      await sock.sendMessage(replyJid, formatError('Debes mencionar a un usuario'));
      return;
    }

    try {
      const participantId = target.jid;
      
      await chat.demoteParticipants([participantId]);
      
      await sock.sendMessage(replyJid, 
        formatSuccess(`✅ @${target.phone} ya no es administrador`),
        { mentions: [participantId] }
      );
    } catch (error) {
      logger.error('[DEMOTE] Error:', error);
      await sock.sendMessage(replyJid, formatError('No se pudo quitar permisos al usuario'));
    }
  }
};
