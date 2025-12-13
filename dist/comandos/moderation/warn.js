import WarningService from '../../services/WarningService.js';
import { getTargetUser } from '../../utils/parser.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';
export default {
    name: 'warn',
    description: 'Advertir a un usuario (menciona o responde a su mensaje)',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, msg, args, groupId, groupJid, userPhone, replyJid }) {
        let chat = null;
        try {
            chat = await msg.getChat();
        }
        catch (e) {
            logger.warn(`[WARN] Could not get chat: ${e.message}`);
        }
        const target = await getTargetUser(msg, chat);
        if (!target) {
            await sock.sendMessage(replyJid, formatError('Debes mencionar a un usuario (@usuario) o responder a su mensaje con .warn'));
            return;
        }
        const targetPhone = target.isLid ? target.phone : (normalizePhone(target.phone) || target.phone);
        const normalizedAdmin = normalizePhone(userPhone) || userPhone;
        const targetName = target.name || targetPhone;
        const mentionJid = target.jid;
        logger.info(`[WARN] Target: phone=${targetPhone}, name=${targetName}, method=${target.method}, isLid=${target.isLid}, jid=${mentionJid}`);
        if (!target.isLid && targetPhone === normalizedAdmin) {
            await sock.sendMessage(replyJid, formatError('No puedes advertirte a ti mismo'));
            return;
        }
        if (chat && chat.isGroup) {
            try {
                const participant = chat.participants?.find(p => p.id._serialized === mentionJid ||
                    p.id._serialized === `${targetPhone}@c.us` ||
                    p.id._serialized === `${targetPhone}@lid`);
                if (participant?.isAdmin) {
                    await sock.sendMessage(replyJid, formatError('🛡️ No puedes advertir a un administrador'));
                    return;
                }
            }
            catch (e) {
                logger.warn(`[WARN] Could not check admin status: ${e.message}`);
            }
        }
        const reason = args.slice(1).join(' ') || 'Sin motivo especificado';
        const adminName = msg.pushName || normalizedAdmin;
        try {
            const result = await WarningService.addWarning(groupId, targetPhone, normalizedAdmin, adminName, reason);
            await sock.sendMessage(replyJid, formatSuccess(`@${target.phone} (${targetName}) ha sido advertido\n\n` +
                `📄 *Razón:* ${reason}\n\n` +
                `📊 *Advertencias:* ${result.warnings}/${result.maxWarnings}`), { mentions: [mentionJid] });
            if (result.shouldKick) {
                logger.info(`[WARN] User ${targetPhone} reached warning limit. Executing kick...`);
                const targetJid = groupJid || (groupId.includes('@') ? groupId : `${groupId}@g.us`);
                let kicked = false;
                try {
                    const chatForKick = await sock.getChatById(targetJid);
                    let kickId = mentionJid;
                    try {
                        const participantMatch = chatForKick.participants?.find(p => {
                            const pid = p?.id?._serialized || p?.id;
                            return pid === mentionJid || pid === `${targetPhone}@c.us` || pid === `${targetPhone}@lid`;
                        });
                        kickId = participantMatch?.id?._serialized || participantMatch?.id || mentionJid;
                    }
                    catch { }
                    await chatForKick.removeParticipants([kickId]);
                    kicked = true;
                    logger.info(`[WARN] removeParticipants succeeded for ${kickId}`);
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
                        await sock.sendMessage(targetJid, `🚫 @${target.phone} (${targetName}) ha sido *expulsado* por acumular ${result.maxWarnings} advertencias.`, { mentions: [mentionJid] });
                    }
                    catch (notifyErr) {
                        logger.warn(`[WARN] Kick notification failed: ${notifyErr?.message || notifyErr}`);
                    }
                }
                else {
                    await sock.sendMessage(replyJid, formatError(`No se pudo expulsar al usuario. Verifica que el bot sea administrador del grupo.`));
                }
            }
        }
        catch (error) {
            logger.error('[WARN] Error in warn command:', error);
            await sock.sendMessage(replyJid, formatError('Error al agregar advertencia: ' + (error.message || 'Error desconocido')));
        }
    }
};
