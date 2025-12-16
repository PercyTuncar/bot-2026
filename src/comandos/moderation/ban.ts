import MemberRepository from '../../repositories/MemberRepository.js';
import GroupRepository from '../../repositories/GroupRepository.js';
import { getFirstMention } from '../../utils/parser.js';
import { normalizePhone } from '../../utils/phone.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';

export default {
  name: 'ban',
  description: 'Banear a un usuario (expulsar y agregar a lista negra)',
  category: 'admin',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 5,

  async execute({ sock, msg, args, groupId, groupJid, userPhone, replyJid }) {
    try {
      await reactLoading(sock, msg);

      const mentionedPhone = getFirstMention(msg);
      if (!mentionedPhone) {
        await reactError(sock, msg);
        await reply(sock, msg, `${EMOJIS.ERROR} Debes mencionar a un usuario`);
        return;
      }

      const normalized = normalizePhone(mentionedPhone);
      const normalizedAdmin = normalizePhone(userPhone);

      if (normalized === normalizedAdmin) {
        await reactError(sock, msg);
        await reply(sock, msg, `${EMOJIS.ERROR} No puedes banearte a ti mismo`);
        return;
      }

      const reason = args.slice(1).join(' ') || 'Sin motivo especificado';

      // Actualizar estado del miembro y marcarlo como baneado
      await MemberRepository.update(groupId, normalized, {
        isMember: false,
        leftAt: new Date(),
        isBanned: true,
        bannedAt: new Date(),
        bannedBy: normalizedAdmin,
        bannedReason: reason
      });

      // Obtener configuración del grupo para agregar a lista negra
      const groupConfig = await GroupRepository.getConfig(groupId);
      const bannedList = groupConfig?.bannedUsers || [];

      if (!bannedList.includes(normalized)) {
        bannedList.push(normalized);
        await GroupRepository.updateConfig(groupId, {
          ...groupConfig,
          bannedUsers: bannedList
        });
      }

      // Expulsar del grupo con Baileys
      const targetJid = groupJid || (groupId.includes('@') ? groupId : `${groupId}@g.us`);
      try {
        await sock.groupParticipantsUpdate(targetJid, [`${normalized}@s.whatsapp.net`], 'remove');
      } catch (kickError: any) {
        logger.warn(`No se pudo expulsar a ${normalized}, pero se marcó como baneado: ${kickError.message}`);
      }

      await sock.sendMessage(targetJid, {
        text: `${EMOJIS.WARNING} @${normalized} ha sido BANEADO\n\nMotivo: ${reason}\n\nNo podrá volver a unirse al grupo.`,
        mentions: [`${normalized}@s.whatsapp.net`]
      });
      await reactSuccess(sock, msg);

      logger.info(`Usuario ${normalized} baneado del grupo ${groupId} por ${normalizedAdmin}`);
    } catch (error: any) {
      await reactError(sock, msg);
      await reply(sock, msg, `${EMOJIS.ERROR} Error al banear usuario: ${error.message}`);
      logger.error('Error in ban command:', error);
    }
  }
};
