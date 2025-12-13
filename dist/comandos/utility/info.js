import MemberRepository from '../../repositories/MemberRepository.js';
import MemberService from '../../services/MemberService.js';
import ConfigService from '../../services/ConfigService.js';
import GroupRepository from '../../repositories/GroupRepository.js';
import { EMOJIS } from '../../config/constants.js';
import { getTargetUser } from '../../utils/parser.js';
import { normalizePhone, getCanonicalId } from '../../utils/phone.js';
import { formatDate, formatRelativeTime } from '../../utils/formatter.js';
import { config } from '../../config/environment.js';
import logger from '../../lib/logger.js';
import { reply } from '../../utils/reply.js';
function isValidDisplayName(name) {
    if (!name || typeof name !== 'string')
        return false;
    const trimmed = name.trim();
    if (!trimmed)
        return false;
    return /[a-zA-ZáéíóúñÁÉÍÓÚÑàèìòùÀÈÌÒÙ]/.test(trimmed);
}
async function getRealUserName(sock, targetJid, member, fallbackPhone) {
    let realName = null;
    if (sock) {
        try {
            const contact = await sock.getContactById(targetJid);
            if (contact) {
                if (isValidDisplayName(contact.pushname)) {
                    realName = contact.pushname.trim();
                    logger.debug(`[INFO] Name from contact.pushname: "${realName}"`);
                }
                else if (isValidDisplayName(contact.name)) {
                    realName = contact.name.trim();
                    logger.debug(`[INFO] Name from contact.name: "${realName}"`);
                }
                else if (isValidDisplayName(contact.shortName)) {
                    realName = contact.shortName.trim();
                    logger.debug(`[INFO] Name from contact.shortName: "${realName}"`);
                }
                else if (isValidDisplayName(contact.notifyName)) {
                    realName = contact.notifyName.trim();
                    logger.debug(`[INFO] Name from contact.notifyName: "${realName}"`);
                }
            }
        }
        catch (e) {
            logger.debug(`[INFO] Could not get contact: ${e.message}`);
        }
    }
    if (!realName && member) {
        const campos = [member.pushname, member.name, member.displayName, member.shortName];
        for (const campo of campos) {
            if (isValidDisplayName(campo)) {
                realName = campo.split('~')[0].trim();
                logger.debug(`[INFO] Name from member DB: "${realName}"`);
                break;
            }
        }
    }
    return realName || fallbackPhone;
}
export default {
    name: 'info',
    description: 'Información de un usuario',
    category: 'general',
    permissions: 'user',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, msg, args, groupId, userPhone, replyJid }) {
        try {
            await msg.react(EMOJIS.LOADING);
            let chat = null;
            try {
                chat = await msg.getChat();
            }
            catch (e) {
                logger.warn(`[INFO] Could not get chat: ${e.message}`);
            }
            const target = await getTargetUser(msg, chat);
            let targetPhone;
            let targetJid;
            let mentionJid;
            if (target) {
                targetPhone = target.isLid ? target.phone : (normalizePhone(target.phone) || target.phone);
                targetJid = target.jid;
                mentionJid = target.jid;
                logger.info(`[INFO] Target from mention/quote: phone=${targetPhone}, jid=${targetJid}, isLid=${target.isLid}`);
            }
            else if (args.length > 0) {
                const searchQuery = args.join(' ').replace('@', '');
                const foundMember = await MemberRepository.searchByName(groupId, searchQuery);
                if (foundMember) {
                    targetPhone = foundMember.phone;
                    targetJid = `${targetPhone}@c.us`;
                    mentionJid = targetJid;
                    logger.info(`[INFO] Target from search: phone=${targetPhone}`);
                }
                else {
                    await reply(sock, msg, `${EMOJIS.WARNING} No encontré a nadie con el nombre "${searchQuery}"`);
                    return;
                }
            }
            else {
                targetPhone = normalizePhone(userPhone) || userPhone;
                targetJid = `${targetPhone}@c.us`;
                mentionJid = targetJid;
                logger.info(`[INFO] Showing own info: ${targetPhone}`);
            }
            try {
                const canonicalJid = await getCanonicalId(sock, targetJid);
                if (canonicalJid && canonicalJid.includes('@c.us')) {
                    const canonicalPhone = canonicalJid.replace('@c.us', '');
                    if (canonicalPhone !== targetPhone) {
                        logger.info(`[INFO] Canonical ID resolved: ${targetPhone} -> ${canonicalPhone}`);
                        targetPhone = canonicalPhone;
                        targetJid = canonicalJid;
                    }
                }
            }
            catch (canonError) {
                logger.warn(`[INFO] Failed to resolve canonical ID: ${canonError.message}`);
            }
            logger.info(`${EMOJIS.INFO} Buscando info de usuario: phone=${targetPhone}, groupId=${groupId}`);
            let found = await MemberRepository.findByPhoneOrLid(groupId, targetPhone, targetPhone);
            let member = found ? found.data : null;
            let memberDocId = found?.docId || targetPhone;
            if (!member) {
                logger.info(`[INFO] Member not found, attempting auto-register for: ${targetPhone}`);
                try {
                    const userId = target ? (target.isLid ? target.jid : targetPhone) : targetPhone;
                    logger.info(`[INFO] Auto-registering member with userId: ${userId}`);
                    member = await MemberService.getOrCreateUnified(groupId, userId, sock, {
                        authorName: target ? target.name : null
                    });
                    memberDocId = member?.phone || memberDocId;
                    if (member?.phone && member.phone !== targetPhone) {
                        logger.info(`[INFO] Resolved targetPhone from ${targetPhone} to ${member.phone}`);
                        targetPhone = member.phone;
                    }
                    logger.info(`[INFO] Member auto-registered successfully: ${member?.phone}`);
                }
                catch (regError) {
                    logger.error(`[INFO] Failed to auto-register member: ${regError.message}`);
                }
            }
            if (!member) {
                logger.warn(`${EMOJIS.WARNING} Usuario no encontrado en DB: ${targetPhone}`);
                await reply(sock, msg, `${EMOJIS.ERROR} Usuario no encontrado. Asegúrate de que el usuario esté en el grupo.`);
                return;
            }
            logger.info(`${EMOJIS.SUCCESS} Miembro encontrado: phone=${member.phone}, displayName=${member.displayName}`);
            const displayName = await getRealUserName(sock, targetJid, member, targetPhone);
            if (displayName && displayName !== targetPhone && displayName !== member.displayName) {
                try {
                    await MemberRepository.update(groupId, memberDocId, {
                        displayName,
                        name: displayName,
                        pushname: displayName
                    });
                    logger.info(`[INFO] Updated displayName for ${memberDocId}: "${displayName}"`);
                }
                catch (e) {
                    logger.debug(`[INFO] Could not update displayName: ${e.message}`);
                }
            }
            const groupConfig = await ConfigService.getGroupConfig(groupId);
            const maxWarnings = groupConfig?.limits?.maxWarnings || 3;
            const mentionId = mentionJid.split('@')[0];
            let response = `${EMOJIS.INFO} *PERFIL DE USUARIO*\n\n`;
            response += `👤 *Nombre:* @${mentionId}\n`;
            response += `${EMOJIS.PHONE} *ID:* ${targetPhone}\n`;
            response += `${EMOJIS.USER} *Rol:* ${member.role || 'member'}\n\n`;
            response += `━━━━ *PUNTOS* ━━━━\n`;
            response += `${EMOJIS.TROPHY} *Puntos actuales:* ${member.points ?? 0} ${config.points.name}\n`;
            if ((member.lifetimePoints ?? 0) > 0 && member.lifetimePoints !== member.points) {
                response += `${EMOJIS.STAR} *Puntos totales:* ${member.lifetimePoints} ${config.points.name}\n`;
            }
            response += `${EMOJIS.MESSAGE} *Mensajes:* ${member.messageCount ?? 0}\n`;
            const pointsGroupConfig = await GroupRepository.getConfig(groupId);
            const group = await GroupRepository.getById(groupId);
            const messagesNeeded = pointsGroupConfig?.messagesPerPoint
                || pointsGroupConfig?.points?.perMessages
                || group?.config?.messagesPerPoint
                || group?.config?.points?.perMessages
                || config.points.perMessages || 10;
            const messageProgress = member.messagesForNextPoint ?? 0;
            if (messageProgress > 0) {
                response += `${EMOJIS.LOADING} *Progreso:* ${messageProgress}/${messagesNeeded} mensajes para +1 punto\n`;
            }
            response += `\n━━━━ *MODERACIÓN* ━━━━\n`;
            response += `${EMOJIS.WARNING} *Advertencias:* ${member.warnings ?? 0}/${maxWarnings}\n`;
            const totalExits = member.totalExits ?? 0;
            response += `🚪 *Salidas del grupo:* ${totalExits}\n`;
            const warnHistory = member.warnHistory || [];
            if (warnHistory.length > 0) {
                response += `📜 *Eventos registrados:* ${warnHistory.length}\n`;
            }
            response += `\n━━━━ *ACTIVIDAD* ━━━━\n`;
            if (member.joinedAt) {
                response += `${EMOJIS.CALENDAR} *Ingresó:* ${formatDate(member.joinedAt)}\n`;
            }
            if (member.lastMessageAt || member.lastActiveAt) {
                const lastActive = member.lastMessageAt || member.lastActiveAt;
                response += `${EMOJIS.CLOCK} *Último mensaje:* ${formatRelativeTime(lastActive)}\n`;
            }
            if (member.lastExitAt) {
                response += `🚪 *Última salida:* ${formatDate(member.lastExitAt)}\n`;
            }
            if (member.isMember === false) {
                response += `\n⚠️ *Este usuario ya no está en el grupo*`;
            }
            logger.info(`[INFO] Sending message with mention: mentionId=${mentionId}, mentionJid=${mentionJid}`);
            await reply(sock, msg, response, { mentions: [mentionJid] });
            await msg.react(EMOJIS.SUCCESS);
            logger.info(`${EMOJIS.SUCCESS} Info enviada correctamente para ${targetPhone}`);
        }
        catch (error) {
            logger.error(`${EMOJIS.ERROR} Error en comando info: ${error.message}`);
            await msg.react(EMOJIS.ERROR);
            await reply(sock, msg, `${EMOJIS.ERROR} Error al obtener información del usuario`);
        }
    }
};
