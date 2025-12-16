import GroupRepository from '../../repositories/GroupRepository.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';
export default {
    name: 'rules',
    description: 'Ver las reglas del grupo',
    usage: '.rules',
    category: 'utility',
    permissions: 'user',
    scope: 'group',
    async execute({ sock, msg, args, groupId, replyJid }) {
        try {
            await reactLoading(sock, msg);
            const group = await GroupRepository.getById(groupId);
            if (!group) {
                await reactError(sock, msg);
                await reply(sock, msg, `${EMOJIS.ERROR} Este grupo no esta registrado.`);
                return;
            }
            const rules = group.rules || group.config?.rules;
            if (!rules || rules.length === 0) {
                await reply(sock, msg, `${EMOJIS.MESSAGE} *Reglas del Grupo*\n\n` +
                    `No se han establecido reglas para este grupo.\n\n` +
                    `_Los administradores pueden configurar las reglas del grupo._`);
                await reactSuccess(sock, msg);
                return;
            }
            let response = `${EMOJIS.MESSAGE} *Reglas del Grupo*\n\n`;
            response += `${EMOJIS.MESSAGE} ${group.name}\n\n`;
            if (typeof rules === 'string') {
                response += rules;
            }
            else if (Array.isArray(rules)) {
                rules.forEach((rule, index) => {
                    response += `${index + 1}. ${rule}\n`;
                });
            }
            response += '\n\n_Por favor, respeta las reglas para mantener un ambiente saludable._';
            await reply(sock, msg, response);
            await reactSuccess(sock, msg);
            logger.info('[RULES] Reglas consultadas en grupo ' + groupId);
        }
        catch (error) {
            await reactError(sock, msg);
            await reply(sock, msg, `${EMOJIS.ERROR} Error al obtener las reglas del grupo.`);
            logger.error('[RULES] Error:', error);
        }
    }
};
