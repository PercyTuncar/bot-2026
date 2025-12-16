import MemberRepository from '../../repositories/MemberRepository.js';
import { extractParticipants } from '../../utils/group.js';
import { normalizePhone } from '../../utils/phone.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';

export default {
  name: 'tagall',
  description: 'Mencionar a todos los miembros del grupo',
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

      const mentions = metadata.participants.map(p => p.id);

      let text = args.join(' ');
      let media = null;

      if (msg.hasMedia) {
        media = await msg.downloadMedia();
      } else if (msg.hasQuotedMsg) {
        const quoted = await msg.getQuotedMessage();
        if (quoted.hasMedia) {
          media = await quoted.downloadMedia();
          if (!text) text = quoted.body || '';
        } else {
          if (!text) text = quoted.body || '¡Atención a todos!';
        }
      } else {
        if (!text) text = '¡Atención a todos!';
      }

      // Enviar mensaje con menciones
      if (media) {
        // Baileys media format
        await sock.sendMessage(targetJid, {
          image: media.data ? Buffer.from(media.data, 'base64') : media,
          caption: text,
          mentions
        });
      } else {
        await sock.sendMessage(targetJid, { text, mentions });
      }

      await reactSuccess(sock, msg);
      logger.info(`Tagall ejecutado en grupo ${targetJid} - ${mentions.length} menciones`);
    } catch (error: any) {
      await reactError(sock, msg);
      await reply(sock, msg, `${EMOJIS.ERROR} Error al mencionar a todos: ${error.message}`);
      logger.error('Error in tagall command:', error);
    }
  }
};
