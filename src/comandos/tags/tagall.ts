import MemberRepository from '../../repositories/MemberRepository.js';
import { extractParticipants } from '../../utils/group.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';

export default {
  name: 'tagall',
  description: 'Mencionar a todos los miembros del grupo',
  category: 'admin',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 30,

  async execute({ sock, msg, args, groupId, groupJid, replyJid }) {
    try {
      const targetJid = groupJid || (groupId.includes('@') ? groupId : `${groupId}@g.us`);
      const chat = await sock.getChatById(targetJid);
      if (!chat || !chat.isGroup) {
        await sock.sendMessage(replyJid, formatError('Este comando solo funciona en grupos'));
        return;
      }

      const participants = extractParticipants(chat);
      const mentions = participants.map(p => p?.id?._serialized || p?.id);

      let text = args.join(' ');
      let media = null;

      if (msg.hasMedia) {
        media = await msg.downloadMedia();
      } else if (msg.hasQuotedMsg) {
        const quoted = await msg.getQuotedMessage();
        if (quoted.hasMedia) {
          media = await quoted.downloadMedia();
          // Si no hay texto en el comando, usar el del mensaje citado o nada
          if (!text) text = quoted.body || ''; 
        } else {
          // Si se cita un mensaje de texto y no hay argumentos, usar el texto citado
          if (!text) text = quoted.body || '¡Atención a todos!';
        }
      } else {
        if (!text) text = '¡Atención a todos!';
      }

      // Enviar mensaje con menciones fantasmas (sin poner los @ en el texto)
      if (media) {
        await sock.sendMessage(targetJid, media, { caption: text, mentions });
      } else {
        await sock.sendMessage(targetJid, text, { mentions });
      }
      
      logger.info(`Tagall ejecutado en grupo ${targetJid} - ${mentions.length} menciones`);
    } catch (error) {
      logger.error('Error in tagall command:', error);
      await sock.sendMessage(replyJid, formatError('Error al mencionar a todos'));
    }
  }
};
