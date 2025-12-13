import GroupRepository from '../../repositories/GroupRepository.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';

export default {
  name: 'addword',
  description: 'Agregar palabra prohibida',
  category: 'admin',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 5,

  async execute({ sock, args, groupId, replyJid }) {
    const word = args.join(' ').toLowerCase();

    if (!word) {
      await sock.sendMessage(replyJid, formatError('Debes especificar una palabra'));
      return;
    }

    try {
      const group = await GroupRepository.getById(groupId);
      const groupConfig = (await GroupRepository.getConfig(groupId) || group?.config || {}) as any;

      const bannedWords = groupConfig.bannedWords?.words || [];

      if (bannedWords.includes(word)) {
        await sock.sendMessage(replyJid, formatError('Esta palabra ya está prohibida'));
        return;
      }

      bannedWords.push(word);

      const newConfig = {
        ...groupConfig,
        bannedWords: {
          enabled: groupConfig.bannedWords?.enabled !== false,
          words: bannedWords,
          action: groupConfig.bannedWords?.action || 'warn'
        }
      };

      await GroupRepository.updateConfig(groupId, newConfig);

      await sock.sendMessage(replyJid,
        formatSuccess(`${EMOJIS.CHECK} Palabra prohibida agregada: "${word}"\n\nTotal de palabras: ${bannedWords.length}`)
      );

      logger.info(`Palabra prohibida "${word}" agregada en grupo ${groupId}`);
    } catch (error) {
      logger.error('Error in addword command:', error);
      await sock.sendMessage(replyJid, formatError('Error al agregar palabra'));
    }
  }
};
