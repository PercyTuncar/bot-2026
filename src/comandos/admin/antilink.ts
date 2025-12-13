import GroupRepository from '../../repositories/GroupRepository.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';

export default {
  name: 'antilink',
  description: 'Activar/desactivar anti-link',
  category: 'admin',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 5,

  async execute({ sock, args, groupId, replyJid }) {
    const action = args[0]?.toLowerCase();

    if (!action || !['on', 'off'].includes(action)) {
      await sock.sendMessage(replyJid, formatError('Uso: .antilink on/off'));
      return;
    }

    try {
      const group = await GroupRepository.getById(groupId);
      const groupConfig = (await GroupRepository.getConfig(groupId) || group?.config || {}) as any;

      const enabled = action === 'on';

      const newConfig = {
        ...groupConfig,
        antiLink: {
          ...(groupConfig.antiLink || {}),
          enabled
        }
      };

      await GroupRepository.updateConfig(groupId, newConfig);

      await sock.sendMessage(replyJid,
        formatSuccess(`${EMOJIS.CHECK} Anti-link ${enabled ? 'activado' : 'desactivado'}`)
      );

      logger.info(`Anti-link ${enabled ? 'activado' : 'desactivado'} en grupo ${groupId}`);
    } catch (error) {
      logger.error('Error in antilink command:', error);
      await sock.sendMessage(replyJid, formatError('Error al configurar anti-link'));
    }
  }
};
