import { extractParticipants } from '../../utils/group.js';
import { normalizePhone } from '../../utils/phone.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';

export default {
  name: 'tagnoadmins',
  description: 'Mencionar solo a los miembros que NO son administradores',
  category: 'admin',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 30,

  async execute({ sock, msg, args, groupId, groupJid, replyJid }) {
    try {
      await reactLoading(sock, msg);

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

      const nonAdmins = metadata.participants.filter(p => !p.admin);

      if (nonAdmins.length === 0) {
        await reactError(sock, msg);
        await reply(sock, msg, `${EMOJIS.ERROR} No se encontraron miembros no-administradores`);
        return;
      }

      // Limitar a 100 menciones
      const mentions = nonAdmins.slice(0, 100).map(p => p.id);

      // Construir texto preservando saltos de línea y formato del mensaje original
      const body = msg.body || '';
      const cmdRegex = /^\s*([.\!\/#])?tagnoadmins\b/i;
      let text = '';
      if (cmdRegex.test(body)) {
        text = body.replace(cmdRegex, '').trim();
      }
      if (!text && args && args.length) {
        text = args.join(' ');
      }

      // Manejo robusto de media
      let media = null;
      try {
        if (msg.hasMedia) {
          media = await msg.downloadMedia();
        }
      } catch (e) {
        logger.warn('tagnoadmins: downloadMedia() falló en msg', e);
      }

      if (!media && msg.hasQuotedMsg) {
        try {
          const quoted = await msg.getQuotedMessage();
          if (quoted?.hasMedia) {
            media = await quoted.downloadMedia();
          }
          if (!text) {
            text = quoted?.body || '';
          }
        } catch (e) {
          logger.warn('tagnoadmins: manejo de mensaje citado falló', e);
        }
      }

      if (!text) text = '¡Atención miembros!';

      // Enviar mensaje con menciones
      if (media) {
        await sock.sendMessage(targetJid, {
          image: media.data ? Buffer.from(media.data, 'base64') : media,
          caption: text,
          mentions
        });
      } else {
        await sock.sendMessage(targetJid, { text, mentions });
      }

      await reactSuccess(sock, msg);
      logger.info(`Tagnoadmins ejecutado en grupo ${targetJid} - ${mentions.length} menciones (ghost tag)`);
    } catch (error: any) {
      await reactError(sock, msg);
      await reply(sock, msg, `${EMOJIS.ERROR} Error al mencionar miembros: ${error.message}`);
      logger.error('Error in tagnoadmins command:', error);
    }
  }
};
