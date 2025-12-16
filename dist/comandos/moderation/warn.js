import WarningService from '../../services/WarningService.js';
import { getTargetUser } from '../../utils/parser.js';
import { normalizePhone } from '../../utils/phone.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';
export default {
    name: 'warn',
    description: 'Advertir a un usuario (menciona o responde a su mensaje)',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, msg, args, groupId, groupJid, userPhone, replyJid }) {
        try {
            await reactLoading(sock, msg);
            let chat = null;
            try {
                chat = await msg.getChat();
            }
            catch (e) {
                logger.warn(`[WARN] Could not get chat: ${e.message}`);
            }
            const target = await getTargetUser(msg, chat);
            if (!target) {
                await reactError(sock, msg);
                await reply(sock, msg, `${EMOJIS.ERROR} Debes mencionar a un usuario (@usuario) o responder a su mensaje con .warn`);
                return;
            }
            const targetPhone = target.isLid ? target.phone : (normalizePhone(target.phone) || target.phone);
            const normalizedAdmin = normalizePhone(userPhone) || userPhone;
            const targetName = target.name || targetPhone;
            const mentionJid = target.jid;
            logger.info(`[WARN] Target: phone=${targetPhone}, name=${targetName}, method=${target.method}, isLid=${target.isLid}, jid=${mentionJid}`);
            if (!target.isLid && targetPhone === normalizedAdmin) {
                await reactError(sock, msg);
                await reply(sock, msg, `${EMOJIS.ERROR} No puedes advertirte a ti mismo`);
                return;
            }
            if (chat && chat.isGroup) {
                try {
                    const participant = chat.participants?.find(p => p.id._serialized === mentionJid ||
                        p.id._serialized === `${targetPhone}@c.us` ||
                        p.id._serialized === `${targetPhone}@lid`);
                    if (participant?.isAdmin) {
                        await reactError(sock, msg);
                        await reply(sock, msg, `${EMOJIS.ERROR} 🛡️ No puedes advertir a un administrador`);
                        return;
                    }
                }
                catch (e) {
                    logger.warn(`[WARN] Could not check admin status: ${e.message}`);
                }
            }
            const reason = args.slice(1).join(' ') || 'Sin motivo especificado';
            const adminName = msg.pushName || normalizedAdmin;
            const result = await WarningService.addWarning(groupId, targetPhone, normalizedAdmin, adminName, reason);
            const progressBar = '⚠️'.repeat(result.warnings) + '▫️'.repeat(result.maxWarnings - result.warnings);
            const mentionText = `@${target.phone}`;
            const mentionJidForMessage = target.isLid ? `${target.phone}@lid` : `${target.phone}@s.whatsapp.net`;
            let warnMessage = `\n\n⚠️ *ADVERTENCIA REGISTRADA* ⚠️\n\n`;
            warnMessage += `👤 *Usuario:* ${mentionText}\n`;
            warnMessage += `📛 *Nombre:* ${targetName}\n\n`;
            warnMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
            warnMessage += `📄 *Motivo:*\n`;
            warnMessage += `> _${reason}_\n`;
            warnMessage += `━━━━━━━━━━━━━━━━━━━━\n\n`;
            warnMessage += `📊 *Advertencias:* ${result.warnings}/${result.maxWarnings}\n`;
            warnMessage += `${progressBar}\n`;
            if (result.warnings >= result.maxWarnings - 1 && !result.shouldKick) {
                warnMessage += `\n⚡ _¡Próxima advertencia = expulsión!_`;
            }
            await sock.sendMessage(replyJid, { text: warnMessage, mentions: [mentionJidForMessage] });
            await reactSuccess(sock, msg);
            if (result.shouldKick) {
                logger.info(`[WARN] User ${targetPhone} reached warning limit. Executing kick...`);
                const targetJid = groupJid || (groupId.includes('@') ? groupId : `${groupId}@g.us`);
                let kicked = false;
                try {
                    const kickId = mentionJid.includes('@') ? mentionJid : `${targetPhone}@s.whatsapp.net`;
                    await sock.groupParticipantsUpdate(targetJid, [kickId], 'remove');
                    kicked = true;
                    logger.info(`[WARN] groupParticipantsUpdate succeeded for ${kickId}`);
                }
                catch (kickError) {
                    logger.error(`[WARN] Error removing participant ${targetPhone}:`, kickError);
                }
                try {
                    await WarningService.logKick(groupId, targetPhone, 'Límite de advertencias alcanzado');
                }
                catch (logErr) {
                    logger.error(`[WARN] Error logging kick for ${targetPhone}:`, logErr);
                }
                if (kicked) {
                    try {
                        await sock.sendMessage(targetJid, {
                            text: `🚫 @${target.phone} (${targetName}) ha sido *expulsado* por acumular ${result.maxWarnings} advertencias.`,
                            mentions: [mentionJid]
                        });
                    }
                    catch (notifyErr) {
                        logger.warn(`[WARN] Kick notification failed: ${notifyErr?.message || notifyErr}`);
                    }
                }
                else {
                    await reply(sock, msg, `${EMOJIS.ERROR} No se pudo expulsar al usuario. Verifica que el bot sea administrador del grupo.`);
                }
            }
        }
        catch (error) {
            await reactError(sock, msg);
            await reply(sock, msg, `${EMOJIS.ERROR} Error al agregar advertencia: ${error.message || 'Error desconocido'}`);
            logger.error('[WARN] Error in warn command:', error);
        }
    }
};
