import MemberRepository from '../../repositories/MemberRepository.js';
import WarningService from '../../services/WarningService.js';
import { getTargetUser } from '../../utils/parser.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatError } from '../../utils/formatter.js';
import { getNow } from '../../utils/time.js';
import logger from '../../lib/logger.js';
export default {
    name: 'kick',
    aliases: ['expulsar', 'ban'],
    description: 'Expulsar a un usuario del grupo (menciona o responde a su mensaje)',
    usage: '.kick @usuario [motivo] o responder a un mensaje con .kick [motivo]',
    example: '.kick @51999999999 Spam repetido',
    category: 'moderation',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, msg, args, groupId, groupJid, userPhone, replyJid }) {
        let chat = null;
        try {
            chat = await msg.getChat();
        }
        catch (e) {
            logger.warn(`[KICK] Could not get chat: ${e.message}`);
        }
        let quotedMessageContent = null;
        let quotedMessageId = null;
        let quotedMsg = null;
        const target = await getTargetUser(msg, chat);
        if (!target) {
            await sock.sendMessage(replyJid, formatError('*Uso del comando:*\n\n' +
                '1️⃣ Responde a un mensaje con _.kick [motivo]_\n' +
                '2️⃣ Usa _.kick @usuario [motivo]_\n\n' +
                '_El motivo es opcional_'));
            return;
        }
        const targetPhone = target.isLid ? target.phone : (normalizePhone(target.phone) || target.phone);
        const normalizedAdmin = normalizePhone(userPhone) || userPhone;
        const targetName = target.name || targetPhone;
        const mentionJid = target.jid;
        logger.info(`[KICK] Target: phone=${targetPhone}, name=${targetName}, method=${target.method}, isLid=${target.isLid}, jid=${mentionJid}`);
        if (!target.isLid && targetPhone === normalizedAdmin) {
            await sock.sendMessage(replyJid, formatError('No puedes expulsarte a ti mismo'));
            return;
        }
        if (chat && chat.isGroup) {
            try {
                const participant = chat.participants?.find(p => p.id._serialized === mentionJid ||
                    p.id._serialized === `${targetPhone}@c.us` ||
                    p.id._serialized === `${targetPhone}@s.whatsapp.net` ||
                    p.id._serialized === `${targetPhone}@lid`);
                if (participant?.isAdmin) {
                    await sock.sendMessage(replyJid, formatError('🛡️ No puedes expulsar a un administrador'));
                    return;
                }
            }
            catch (e) {
                logger.warn(`[KICK] Could not check admin status: ${e.message}`);
            }
        }
        if (msg.hasQuotedMsg && target.method === 'quoted') {
            try {
                quotedMsg = await msg.getQuotedMessage();
                if (quotedMsg) {
                    quotedMessageId = quotedMsg.id?._serialized || quotedMsg.id?.id;
                    quotedMessageContent = quotedMsg.body || quotedMsg.caption || '[Mensaje sin texto - posible media]';
                    if (quotedMsg.hasMedia) {
                        const mediaType = quotedMsg.type || 'media';
                        quotedMessageContent = `[${mediaType.toUpperCase()}] ${quotedMessageContent || ''}`.trim();
                    }
                    logger.info(`[KICK] Captured quoted message content: "${quotedMessageContent.substring(0, 100)}..."`);
                }
            }
            catch (e) {
                logger.warn(`[KICK] Could not capture quoted message: ${e.message}`);
            }
        }
        let reason = '';
        if (target.method === 'quoted') {
            reason = args.join(' ').trim();
        }
        else {
            reason = args.slice(1).join(' ').trim();
        }
        if (quotedMessageContent) {
            if (reason) {
                reason = `${reason}\n\n📝 *Evidencia (mensaje eliminado):*\n"${quotedMessageContent}"`;
            }
            else {
                reason = `📝 *Mensaje que causó la expulsión:*\n"${quotedMessageContent}"`;
            }
        }
        if (!reason) {
            reason = 'Expulsado por un administrador';
        }
        const adminName = msg.pushName || normalizedAdmin;
        try {
            const found = await MemberRepository.findByPhoneOrLid(groupId, targetPhone, targetPhone);
            const docId = found?.docId || targetPhone;
            await MemberRepository.update(groupId, docId, {
                isMember: false,
                kickedAt: getNow(),
                lastKickReason: reason,
                lastKickBy: normalizedAdmin,
                lastKickByName: adminName
            });
            await WarningService.logKick(groupId, targetPhone, reason);
            if (quotedMsg && quotedMessageId) {
                try {
                    const deleted = await quotedMsg.delete(true);
                    if (deleted) {
                        logger.info(`[KICK] Quoted message deleted successfully: ${quotedMessageId}`);
                    }
                }
                catch (deleteError) {
                    logger.warn(`[KICK] Could not delete quoted message: ${deleteError.message}`);
                }
            }
            const targetJid = groupJid || (groupId.includes('@') ? groupId : `${groupId}@g.us`);
            const chatForKick = await sock.getChatById(targetJid);
            const participantToKick = target.isLid ? mentionJid : `${targetPhone}@s.whatsapp.net`;
            await chatForKick.removeParticipants([participantToKick]);
            let confirmMessage = `🚫 *USUARIO EXPULSADO*\n\n`;
            confirmMessage += `👤 *Usuario:* @${target.phone} (${targetName})\n`;
            confirmMessage += `👮 *Por:* ${adminName}\n`;
            confirmMessage += `📅 *Fecha:* ${new Date().toLocaleString('es-PE')}\n\n`;
            confirmMessage += `📋 *Motivo:*\n${reason}`;
            if (quotedMessageContent) {
                confirmMessage += `\n\n🗑️ _El mensaje de evidencia ha sido eliminado_`;
            }
            await sock.sendMessage(targetJid, confirmMessage, { mentions: [participantToKick] });
            logger.info(`[KICK] User ${targetPhone} (${targetName}) kicked from group ${groupId} by ${normalizedAdmin}`);
        }
        catch (error) {
            logger.error('[KICK] Error in kick command:', error);
            let errorMessage = 'Error al expulsar usuario.';
            if (error.message?.includes('not-authorized') || error.message?.includes('forbidden')) {
                errorMessage = 'El bot no tiene permisos de administrador en este grupo.';
            }
            else if (error.message?.includes('not-participant') || error.message?.includes('not found')) {
                errorMessage = 'El usuario no se encuentra en el grupo.';
            }
            else if (error.message?.includes('admin')) {
                errorMessage = 'No se puede expulsar a un administrador.';
            }
            await sock.sendMessage(replyJid, formatError(errorMessage));
        }
    }
};
