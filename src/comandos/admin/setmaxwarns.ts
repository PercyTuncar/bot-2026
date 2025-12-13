import GroupRepository from '../../repositories/GroupRepository.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';

export default {
  name: 'setmaxwarns',
  description: 'Cambiar cantidad máxima de advertencias antes de expulsar',
  category: 'admin',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 5,

  async execute({ sock, args, groupId, replyJid }) {
    const amount = parseInt(args[0]);

    if (isNaN(amount) || amount < 1 || amount > 10) {
      await sock.sendMessage(replyJid, formatError('Debes especificar un número entre 1 y 10\nEjemplo: .setmaxwarns 3'));
      return;
    }

    try {
      const group = await GroupRepository.getById(groupId);
      const groupConfig = await GroupRepository.getConfig(groupId) || group?.config || {};

      const newConfig = {
        ...groupConfig,
        maxWarnings: amount
      };

      await GroupRepository.updateConfig(groupId, newConfig);

      await sock.sendMessage(replyJid,
        formatSuccess(`${EMOJIS.WARNING} Advertencias máximas cambiadas a: ${amount}`)
      );

      logger.info(`Max warnings cambiado a ${amount} en grupo ${groupId}`);
    } catch (error) {
      logger.error('Error in setmaxwarns command:', error);
      await sock.sendMessage(replyJid, formatError('Error al cambiar configuración'));
    }
  }
};
