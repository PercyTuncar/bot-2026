import GroupRepository from '../../repositories/GroupRepository.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
export default {
    name: 'allowdomain',
    description: 'Agregar dominio permitido en anti-link',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, args, groupId, replyJid }) {
        const domain = args[0];
        if (!domain) {
            await sock.sendMessage(replyJid, formatError('Debes especificar un dominio\nEjemplo: .allowdomain youtube.com'));
            return;
        }
        try {
            const group = await GroupRepository.getById(groupId);
            const groupConfig = (await GroupRepository.getConfig(groupId) || group?.config || {});
            const allowedDomains = groupConfig.antiLink?.allowedDomains || [];
            if (allowedDomains.includes(domain)) {
                await sock.sendMessage(replyJid, formatError('Este dominio ya está permitido'));
                return;
            }
            allowedDomains.push(domain);
            const newConfig = {
                ...groupConfig,
                antiLink: {
                    ...(groupConfig.antiLink || {}),
                    allowedDomains
                }
            };
            await GroupRepository.updateConfig(groupId, newConfig);
            await sock.sendMessage(replyJid, formatSuccess(`${EMOJIS.CHECK} Dominio agregado: ${domain}\n\nDominios permitidos: ${allowedDomains.length}`));
            logger.info(`Dominio ${domain} permitido en grupo ${groupId}`);
        }
        catch (error) {
            logger.error('Error in allowdomain command:', error);
            await sock.sendMessage(replyJid, formatError('Error al agregar dominio'));
        }
    }
};
