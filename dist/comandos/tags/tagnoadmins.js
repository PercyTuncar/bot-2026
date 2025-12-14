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
            const body = msg.body || '';
            const cmdRegex = /^\s*([.\!\/#])?tagnoadmins\b/i;
            let text = '';
            if (cmdRegex.test(body)) {
                text = body.replace(cmdRegex, '').trim();
            }
            if (!text && args && args.length) {
                text = args.join(' ');
            }
            let media = null;
            try {
                if (msg.hasMedia) {
                    media = await msg.downloadMedia();
                }
            }
            catch (e) {
                logger.warn('tagnoadmins: downloadMedia() falló en msg', e);
            }
            if (!media && msg.hasQuotedMsg) {
                try {
                    const quoted = await msg.getQuotedMessage();
                    if (quoted?.hasMedia) {
                        media = await quoted.downloadMedia();
                    }
                    if (!text) {
                        text = quoted?.body || '';
                    }
                }
                catch (e) {
                    logger.warn('tagnoadmins: manejo de mensaje citado falló', e);
                }
            }
            if (!text)
                text = '¡Atención miembros!';
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
