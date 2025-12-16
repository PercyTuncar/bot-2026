import { extractParticipants } from '../../utils/group.js';
import { normalizePhone } from '../../utils/phone.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';

export default {
  name: 'tagadmins',
  description: 'Mencionar solo a los administradores del grupo',
  category: 'admin',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 15,

  async execute({ sock, msg, args, groupId, groupJid, replyJid }) {
    try {
      await reactLoading(sock, msg);

      const message = args.join(' ') || '¡Atención administradores!';
      const targetJid = groupJid || (groupId.includes('@') ? groupId : `${groupId}@g.us`);

      // Baileys: usar groupMetadata en lugar de getChatById
      let metadata;
      try {
        metadata = await sock.groupMetadata(targetJid);
      } catch (e) {
        await reactError(sock, msg);
        await reply(sock, msg, `${EMOJIS.ERROR} Este comando solo funciona en grupos`);
        return;
      }

      const admins = metadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');

      if (admins.length === 0) {
        await reactError(sock, msg);
        await reply(sock, msg, `${EMOJIS.ERROR} No se encontraron administradores`);
        return;
      }

      const mentions = admins.map(p => p.id);

      let text = `${EMOJIS.CROWN} *MENCIÓN A ADMINISTRADORES*\n\n${message}\n\n`;

      mentions.forEach(mention => {
        const phone = normalizePhone(mention);
        text += `@${phone} `;
      });

      await sock.sendMessage(targetJid, { text, mentions });
      await reactSuccess(sock, msg);

      logger.info(`Tagadmins ejecutado en grupo ${targetJid} - ${mentions.length} menciones`);
    } catch (error: any) {
      await reactError(sock, msg);
      await reply(sock, msg, `${EMOJIS.ERROR} Error al mencionar administradores: ${error.message}`);
      logger.error('Error in tagadmins command:', error);
    }
  }
};
