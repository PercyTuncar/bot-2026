import WarningService from '../../services/WarningService.js';
import ConfigService from '../../services/ConfigService.js';
import { EMOJIS } from '../../config/constants.js';
import { getTargetUser } from '../../utils/parser.js';
import { normalizePhone } from '../../utils/phone.js';
import logger from '../../lib/logger.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';

export default {
  name: 'unwarn',
  description: 'Quitar última advertencia a un usuario (menciona o responde a su mensaje)',
  category: 'admin',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 5,

  async execute({ sock, msg, groupId, userPhone, replyJid }) {
    try {
      await reactLoading(sock, msg);

      let chat = null;
      try {
        chat = await msg.getChat();
      } catch (e) {
        logger.warn(`[UNWARN] Could not get chat: ${e.message}`);
      }

      const target = await getTargetUser(msg, chat);

      if (!target) {
        await reactError(sock, msg);
        await reply(sock, msg, `${EMOJIS.ERROR} Debes mencionar a un usuario (@usuario) o responder a su mensaje con .unwarn`);
        return;
      }

      const targetPhone = target.isLid ? target.phone : (normalizePhone(target.phone) || target.phone);
      const normalizedAdmin = normalizePhone(userPhone) || userPhone;
      const targetName = target.name || targetPhone;
      const mentionJid = target.jid;

      logger.info(`[UNWARN] Target: phone=${targetPhone}, name=${targetName}, method=${target.method}, isLid=${target.isLid}`);

      const result = await WarningService.resetWarnings(
        groupId,
        targetPhone,
        normalizedAdmin,
        msg.pushName || normalizedAdmin
      );

      const config = await ConfigService.getGroupConfig(groupId);
      const maxWarnings = config?.limits?.maxWarnings || 3;

      // Construir mención correcta (igual que en welcome y warn)
      const mentionText = `@${target.phone}`;
      const mentionJidForMessage = target.isLid ? `${target.phone}@lid` : `${target.phone}@s.whatsapp.net`;

      let unwarnMessage = `\n\n✅ *ADVERTENCIAS RESETEADAS* ✅\n\n`;
      unwarnMessage += `👤 *Usuario:* ${mentionText}\n`;
      unwarnMessage += `📛 *Nombre:* ${targetName}\n\n`;
      unwarnMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
      unwarnMessage += `📊 *Estado actual:*\n`;
      unwarnMessage += `> _Advertencias: 0/${maxWarnings}_\n`;
      unwarnMessage += `> _Historial limpio_\n`;
      unwarnMessage += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      unwarnMessage += `🎉 _El usuario tiene un nuevo comienzo_`;

      await sock.sendMessage(replyJid, { text: unwarnMessage, mentions: [mentionJidForMessage] });
      await reactSuccess(sock, msg);
    } catch (error: any) {
      await reactError(sock, msg);
      await reply(sock, msg, `${EMOJIS.ERROR} Error al quitar advertencia: ${error.message}`);
      logger.error('[UNWARN] Error in unwarn command:', error);
    }
  }
};
