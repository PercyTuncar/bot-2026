import GroupRepository from '../../repositories/GroupRepository.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
export default {
    name: 'removeword',
    description: 'Quitar palabra prohibida',
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
            const groupConfig = (await GroupRepository.getConfig(groupId) || group?.config || {});
            const bannedWords = groupConfig.bannedWords?.words || [];
            if (!bannedWords.includes(word)) {
                await sock.sendMessage(replyJid, formatError('Esta palabra no está en la lista'));
                return;
            }
            const newBannedWords = bannedWords.filter(w => w !== word);
            const newConfig = {
                ...groupConfig,
                bannedWords: {
                    ...groupConfig.bannedWords,
                    words: newBannedWords
                }
            };
            await GroupRepository.updateConfig(groupId, newConfig);
            await sock.sendMessage(replyJid, formatSuccess(`${EMOJIS.CHECK} Palabra "${word}" removida\n\nTotal de palabras: ${newBannedWords.length}`));
            logger.info(`Palabra "${word}" removida en grupo ${groupId}`);
        }
        catch (error) {
            logger.error('Error in removeword command:', error);
            await sock.sendMessage(replyJid, formatError('Error al remover palabra'));
        }
    }
};
