import GroupRepository from '../../repositories/GroupRepository.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';

export default {
  name: 'antilink',
  description: 'Activar/desactivar filtro de enlaces',
  category: 'moderation',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 5,

  async execute({ sock, msg, args, groupId, replyJid }) {
    try {
      await reactLoading(sock, msg);

      const action = args[0]?.toLowerCase();

      if (!['on', 'off'].includes(action)) {
        await reactError(sock, msg);
        await reply(sock, msg, `${EMOJIS.ERROR} Uso: .antilink on | off`);
        return;
      }

      const config: any = await GroupRepository.getConfig(groupId) || {};

      const newConfig = {
        ...config,
        moderation: {
          ...(config.moderation || {}),
          antiLink: action === 'on'
        }
      };

      await GroupRepository.updateConfig(groupId, newConfig);

      await reply(sock, msg, `${EMOJIS.SUCCESS} AntiLink ha sido ${action === 'on' ? 'ACTIVADO ✅' : 'DESACTIVADO ❌'}`);
      await reactSuccess(sock, msg);
    } catch (error: any) {
      await reactError(sock, msg);
      await reply(sock, msg, `${EMOJIS.ERROR} Error al actualizar configuración: ${error.message}`);
      logger.error('[ANTILINK] Error:', error);
    }
  }
};
