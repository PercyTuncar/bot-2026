import { getTargetUser } from '../../utils/parser.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';
export default {
    name: 'promote',
    description: 'Promover a un usuario a administrador',
    category: 'moderation',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, msg, groupJid, groupId, replyJid }) {
        try {
            await reactLoading(sock, msg);
            let chat = null;
            try {
                chat = await msg.getChat();
            }
            catch (e) {
                logger.warn(`[PROMOTE] Could not get chat: ${e.message}`);
            }
            const target = await getTargetUser(msg, chat);
            if (!target) {
                await reactError(sock, msg);
                await reply(sock, msg, `${EMOJIS.ERROR} Debes mencionar a un usuario`);
                return;
            }
            const participantId = target.jid;
            const targetJid = groupJid || (groupId.includes('@') ? groupId : `${groupId}@g.us`);
            await sock.groupParticipantsUpdate(targetJid, [participantId], 'promote');
            await sock.sendMessage(replyJid, {
                text: `✅ @${target.phone} ha sido promovido a administrador`,
                mentions: [participantId]
            });
            await reactSuccess(sock, msg);
        }
        catch (error) {
            await reactError(sock, msg);
            await reply(sock, msg, `${EMOJIS.ERROR} No se pudo promover al usuario: ${error.message}`);
            logger.error('[PROMOTE] Error:', error);
        }
    }
};
