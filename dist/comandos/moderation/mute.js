import { getTargetUser } from '../../utils/parser.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
import { reply, reactLoading, reactError } from '../../utils/reply.js';
export default {
    name: 'mute',
    description: 'Silenciar a un usuario en el grupo (solo admins)',
    category: 'moderation',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, msg, args, replyJid }) {
        try {
            await reactLoading(sock, msg);
            let chat = null;
            try {
                chat = await msg.getChat();
            }
            catch (e) {
                logger.warn(`[MUTE] Could not get chat: ${e.message}`);
            }
            const target = await getTargetUser(msg, chat);
            if (!target) {
                await reactError(sock, msg);
                await reply(sock, msg, `${EMOJIS.ERROR} Debes mencionar a un usuario para silenciar`);
                return;
            }
            await reactError(sock, msg);
            await reply(sock, msg, `${EMOJIS.ERROR} Comando mute en desarrollo (requiere definir si es mute de bot o de grupo)`);
        }
        catch (error) {
            await reactError(sock, msg);
            await reply(sock, msg, `${EMOJIS.ERROR} Error en comando mute: ${error.message}`);
            logger.error('[MUTE] Error:', error);
        }
    }
};
