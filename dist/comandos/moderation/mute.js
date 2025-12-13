import { getTargetUser } from '../../utils/parser.js';
import { formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';
export default {
    name: 'mute',
    description: 'Silenciar a un usuario en el grupo (solo admins)',
    category: 'moderation',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, msg, args, replyJid }) {
        let chat = null;
        try {
            chat = await msg.getChat();
        }
        catch (e) {
            logger.warn(`[MUTE] Could not get chat: ${e.message}`);
        }
        const target = await getTargetUser(msg, chat);
        if (!target) {
            await sock.sendMessage(replyJid, formatError('Debes mencionar a un usuario para silenciar'));
            return;
        }
        await sock.sendMessage(replyJid, formatError('Comando mute en desarrollo (requiere definir si es mute de bot o de grupo)'));
    }
};
