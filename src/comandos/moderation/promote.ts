
import { getTargetUser } from '../../utils/parser.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';

export default {
  name: 'promote',
  description: 'Promover a un usuario a administrador',
  category: 'moderation',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 5,

  async execute({ sock, msg, replyJid }) {
    let chat = null;
    try {
      chat = await msg.getChat();
    } catch (e) {
      logger.warn(`[PROMOTE] Could not get chat: ${e.message}`);
    }

    const target = await getTargetUser(msg, chat);
    
    if (!target) {
      await sock.sendMessage(replyJid, formatError('Debes mencionar a un usuario'));
      return;
    }

    try {
      // Usar el JID correcto (LID o Phone) para la API
      const participantId = target.jid;
      
      await chat.promoteParticipants([participantId]);
      
      await sock.sendMessage(replyJid, 
        formatSuccess(`✅ @${target.phone} ha sido promovido a administrador`),
        { mentions: [participantId] }
      );
    } catch (error) {
      logger.error('[PROMOTE] Error:', error);
      await sock.sendMessage(replyJid, formatError('No se pudo promover al usuario'));
    }
  }
};
