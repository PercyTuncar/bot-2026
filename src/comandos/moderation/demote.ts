import { getTargetUser } from '../../utils/parser.js';
import { normalizePhone } from '../../utils/phone.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';

export default {
  name: 'demote',
  description: 'Quitar permisos de administrador a un usuario',
  category: 'moderation',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 5,

  async execute({ sock, msg, groupJid, groupId, replyJid }) {
    try {
      await reactLoading(sock, msg);

      let chat = null;
      try {
        chat = await msg.getChat();
      } catch (e) {
        logger.warn(`[DEMOTE] Could not get chat: ${e.message}`);
      }

      const target = await getTargetUser(msg, chat);

      if (!target) {
        await reactError(sock, msg);
        await reply(sock, msg, `${EMOJIS.ERROR} Debes mencionar a un usuario`);
        return;
      }

      const participantId = target.jid;
      const targetJid = groupJid || (groupId.includes('@') ? groupId : `${groupId}@g.us`);

      // Baileys: usar groupParticipantsUpdate con 'demote'
      await sock.groupParticipantsUpdate(targetJid, [participantId], 'demote');

      await sock.sendMessage(replyJid, {
        text: `✅ @${target.phone} ya no es administrador`,
        mentions: [participantId]
      });
      await reactSuccess(sock, msg);
    } catch (error: any) {
      await reactError(sock, msg);
      await reply(sock, msg, `${EMOJIS.ERROR} No se pudo quitar permisos al usuario: ${error.message}`);
      logger.error('[DEMOTE] Error:', error);
    }
  }
};
