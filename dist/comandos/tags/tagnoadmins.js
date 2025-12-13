import { extractParticipants } from '../../utils/group.js';
import { formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';
export default {
    name: 'tagnoadmins',
    description: 'Mencionar solo a los miembros que NO son administradores',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 30,
    async execute({ sock, msg, args, groupId, groupJid, replyJid }) {
        try {
            const targetJid = groupJid || (groupId.includes('@') ? groupId : `${groupId}@g.us`);
            const chat = await sock.getChatById(targetJid);
            if (!chat || !chat.isGroup) {
                await sock.sendMessage(replyJid, formatError('Este comando solo funciona en grupos'));
                return;
            }
            const participants = extractParticipants(chat);
            const nonAdmins = participants.filter(p => !p?.isAdmin && !p?.isSuperAdmin);
            if (nonAdmins.length === 0) {
                await sock.sendMessage(replyJid, formatError('No se encontraron miembros no-administradores'));
                return;
            }
            const mentions = nonAdmins.slice(0, 100).map(p => p?.id?._serialized || p?.id);
            let text = args.join(' ');
            let media = null;
            if (msg.hasMedia) {
                media = await msg.downloadMedia();
            }
            else if (msg.hasQuotedMsg) {
                const quoted = await msg.getQuotedMessage();
                if (quoted.hasMedia) {
                    media = await quoted.downloadMedia();
                    if (!text)
                        text = quoted.body || '';
                }
                else {
                    if (!text)
                        text = quoted.body || '¡Atención miembros!';
                }
            }
            else {
                if (!text)
                    text = '¡Atención miembros!';
            }
            if (media) {
                await sock.sendMessage(targetJid, media, { caption: text, mentions });
            }
            else {
                await sock.sendMessage(targetJid, text, { mentions });
            }
            logger.info(`Tagnoadmins ejecutado en grupo ${targetJid} - ${mentions.length} menciones (ghost tag)`);
        }
        catch (error) {
            logger.error('Error in tagnoadmins command:', error);
            await sock.sendMessage(replyJid, formatError('Error al mencionar miembros'));
        }
    }
};
