import CommandDispatcher from './command-dispatcher.js';
import MessageRouter from './message-router.js';
import MessageService from '../services/MessageService.js';
import PointsService from '../services/PointsService.js';
import MemberService from '../services/MemberService.js';
import WelcomeService from '../services/WelcomeService.js';
import ModerationService from '../services/ModerationService.js';
import GroupRepository from '../repositories/GroupRepository.js';
import { normalizePhone, getUserId, normalizeGroupId, extractIdFromWid, getCanonicalId } from '../utils/phone.js';
import { resolveLidToPhone } from '../utils/lid-resolver.js';
import logger from '../lib/logger.js';
export class EventHandler {
    sock;
    processedMessages;
    constructor(sock) {
        this.sock = sock;
        this.processedMessages = new Map();
        setInterval(() => {
            const now = Date.now();
            for (const [key, timestamp] of this.processedMessages.entries()) {
                if (now - timestamp > 2 * 60 * 1000) {
                    this.processedMessages.delete(key);
                }
            }
        }, 60 * 1000);
    }
    async handleMessage(msg) {
        try {
            const messageId = msg.id?.id || msg.id?._serialized ||
                `${msg.timestamp || Date.now()}_${msg.from}_${(msg.body || '').substring(0, 30)}`;
            if (this.processedMessages.has(messageId)) {
                return;
            }
            this.processedMessages.set(messageId, Date.now());
            let text = msg.body || '';
            if (typeof text !== 'string') {
                text = '';
            }
            msg.fromMe = !!msg.fromMe;
            logger.debug(`[MSG DEBUG] from=${msg.from}, to=${msg.to}, author=${typeof msg.author === 'string' ? msg.author : JSON.stringify(msg.author)}`);
            const chatId = msg.from;
            const isGroup = chatId && chatId.endsWith('@g.us');
            const groupId = isGroup ? chatId : null;
            logger.debug(`[MSG DEBUG] chatId=${chatId}, isGroup=${isGroup}, groupId=${groupId}`);
            let userPhone = getUserId(msg, isGroup);
            logger.debug(`[MSG DEBUG] getUserId returned: ${userPhone || 'EMPTY'}`);
            if (!userPhone) {
                if (msg.from && msg.from.includes('@g.us') && msg.to && msg.to.endsWith('@c.us')) {
                    userPhone = normalizePhone(msg.to);
                    logger.info(`📱 DM desde Web detectado: usando msg.to = ${userPhone}`);
                }
            }
            const originalUserId = userPhone;
            if (userPhone) {
                try {
                    const canonical = await getCanonicalId(this.sock, userPhone);
                    if (canonical && canonical !== userPhone && canonical.includes('@c.us')) {
                        const canonicalPhone = canonical.replace('@c.us', '');
                        if (canonicalPhone !== userPhone) {
                            logger.info(`🔄 ID canónico resuelto: ${userPhone} → ${canonicalPhone}`);
                            userPhone = canonicalPhone;
                        }
                    }
                    else if (userPhone.includes('@lid') && groupId) {
                        const resolved = await resolveLidToPhone(this.sock, groupId, userPhone);
                        if (resolved) {
                            logger.info(`🔄 LID resuelto a número real (fallback grupo): ${userPhone} → ${resolved}`);
                            userPhone = resolved;
                        }
                    }
                }
                catch (canonError) {
                    logger.warn(`Error obteniendo canonical ID: ${canonError.message}`);
                }
            }
            if (originalUserId !== userPhone) {
                logger.debug(`🏷️ Identificador transformado: ${originalUserId} → ${userPhone}`);
            }
            if (!userPhone) {
                if (!msg.fromMe) {
                    logger.warn(`⚠️ No se pudo extraer identificador del mensaje.`);
                    logger.warn(`   msg.from: ${msg.from}`);
                    logger.warn(`   msg.to: ${msg.to || 'undefined'}`);
                    logger.warn(`   msg.author: ${msg.author || 'undefined'}`);
                    logger.warn(`   isGroup: ${isGroup}`);
                }
                return;
            }
            if (text.trim().startsWith('.')) {
                logger.info(`📨 Comando recibido: "${text}" de ${userPhone} (${isGroup ? 'grupo' : 'DM'}), msg.from="${msg.from}"`);
            }
            const botInfo = this.sock.info;
            const botPhone = botInfo?.wid?.user;
            const senderPhone = userPhone.replace('@s.whatsapp.net', '').replace('@g.us', '').replace('@c.us', '');
            const normalizedBotPhone = botPhone ? botPhone.replace('@s.whatsapp.net', '').replace('@g.us', '').replace('@c.us', '') : null;
            const isOwner = normalizedBotPhone && senderPhone === normalizedBotPhone;
            const isCommand = text.trim().startsWith('.');
            if (msg.fromMe && isOwner && !isCommand) {
                return;
            }
            if (isOwner && isCommand) {
                logger.info(`👤 Owner enviando comando: "${text}"`);
            }
            if (!isCommand && text.trim().length > 0) {
                logger.info(`💬 Mensaje de ${userPhone} (${isGroup ? 'grupo' : 'DM'}): "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
            }
            const routeResult = await MessageRouter.route(msg);
            if (routeResult.isCommand) {
                logger.info(`🔍 Comando detectado: "${text}" → ${routeResult.parsed?.command || 'desconocido'}`);
            }
            if (routeResult.isGroup) {
                const group = await GroupRepository.getById(routeResult.groupId);
                logger.info(`📊 Group check: groupId=${routeResult.groupId}, exists=${!!group}, isActive=${group?.isActive}`);
                if (group && group.isActive) {
                    const authorName = msg._data?.notifyName || msg.pushName || msg.notifyName;
                    logger.info(`👤 Getting or creating member: userId=${userPhone}, name=${authorName || 'unknown'}`);
                    await MemberService.getOrCreateUnified(routeResult.groupId, userPhone, this.sock, { authorName });
                    if (!routeResult.isCommand) {
                        const groupConfig = await GroupRepository.getConfig(routeResult.groupId);
                        const config = groupConfig || group?.config || {};
                        const spamCheck = await ModerationService.checkAntiSpam(userPhone, routeResult.groupId, config);
                        if (spamCheck.violation) {
                            await ModerationService.handleViolation(this.sock, msg, spamCheck, routeResult.groupId, userPhone);
                            return;
                        }
                        const bannedWordsCheck = await ModerationService.checkBannedWords(routeResult.groupId, text, config);
                        if (bannedWordsCheck.violation) {
                            await ModerationService.handleViolation(this.sock, msg, bannedWordsCheck, routeResult.groupId, userPhone);
                            return;
                        }
                        const antiLinkCheck = await ModerationService.checkAntiLink(routeResult.groupId, text, config);
                        if (antiLinkCheck.violation) {
                            await ModerationService.handleViolation(this.sock, msg, antiLinkCheck, routeResult.groupId, userPhone);
                            return;
                        }
                    }
                    logger.info(`💾 Saving message: groupId=${routeResult.groupId}, author=${userPhone}, isCommand=${routeResult.isCommand}`);
                    await MessageService.saveMessage(routeResult.groupId, msg, routeResult.isCommand, userPhone, this.sock);
                    logger.info(`✅ Message saved successfully`);
                    const commandName = routeResult.parsed?.command;
                    const shouldCountForPoints = !routeResult.isCommand || commandName === 'mypoints';
                    if (shouldCountForPoints) {
                        logger.info(`🎯 Processing points for: groupId=${routeResult.groupId}, userId=${userPhone}`);
                        const pointsResult = await PointsService.processMessage(routeResult.groupId, msg, userPhone);
                        logger.info(`✅ Points processed: ${pointsResult ? 'success' : 'null'}`);
                        if (pointsResult?.pointsAdded) {
                            try {
                                const participantJid = isGroup ? msg.author : msg.from;
                                await this.sock.sendMessage(msg.from, `@${String(participantJid).split('@')[0]} ${pointsResult.message}`, { mentions: [participantJid] });
                                if (pointsResult.levelUp && pointsResult.levelUp.leveled) {
                                    await this.sock.sendMessage(msg.from, `@${userPhone.replace('@s.whatsapp.net', '').replace('@c.us', '')} ${pointsResult.levelUp.message}`, { mentions: [participantJid] });
                                }
                            }
                            catch (error) {
                                logger.error('Error al enviar notificación de punto:', error);
                            }
                        }
                    }
                }
            }
            else {
                await MessageService.savePrivateMessage(userPhone, msg, routeResult.isCommand);
            }
            if (routeResult.isCommand) {
                await CommandDispatcher.dispatch({
                    msg,
                    sock: this.sock,
                    routeResult,
                    userPhone
                });
            }
        }
        catch (error) {
            logger.error('Error al manejar mensaje:', error);
        }
    }
    async handleGroupParticipantsUpdate(update) {
        try {
            logger.info(`👥 Group Participants Update: ${JSON.stringify(update)}`);
            const { id: groupId, participants, action } = update;
            const group = await GroupRepository.getById(groupId);
            if (!group) {
                logger.warn(`⚠️ Group not found in DB for update: ${JSON.stringify(groupId)}`);
                return;
            }
            if (!group.isActive) {
                logger.info(`ℹ️ Group ${group.id} is not active, ignoring participant update`);
                return;
            }
            for (const participantId of participants) {
                const idString = extractIdFromWid(participantId);
                let phone = normalizePhone(idString);
                if (!phone && idString && idString.includes('@lid')) {
                    phone = idString;
                }
                if (action === 'add') {
                    if (phone) {
                        logger.info(`👤 Member joined: ${phone} in group ${groupId}`);
                        await this.handleMemberJoin(groupId, phone);
                    }
                    else {
                        logger.warn(`⚠️ Member joined event ignored: Could not extract phone from ${JSON.stringify(participantId)}`);
                    }
                }
                else if (action === 'remove') {
                    if (phone) {
                        logger.info(`👤 Member left: ${phone} in group ${groupId}`);
                        await this.handleMemberLeave(groupId, phone);
                    }
                    else {
                        logger.warn(`⚠️ Member left event ignored: Could not extract phone from ${JSON.stringify(participantId)}`);
                    }
                }
            }
        }
        catch (error) {
            logger.error('Error al manejar cambio de participantes:', error);
        }
    }
    async handleGroupJoin(notification) {
        try {
            logger.info(`👥 Group Join Notification received`);
            const groupId = normalizeGroupId(notification.chatId || notification.id?.remote);
            const participantIds = notification.recipientIds || [];
            const group = await GroupRepository.getById(groupId);
            if (!group || !group.isActive) {
                logger.info(`ℹ️ Group Join ignored (group inactive or not found): ${groupId}`);
                return;
            }
            let recipientContacts = [];
            try {
                if (typeof notification.getRecipientContacts === 'function') {
                    recipientContacts = await notification.getRecipientContacts();
                    logger.info(`✅ getRecipientContacts() returned ${recipientContacts.length} contacts`);
                    recipientContacts.forEach((c, idx) => {
                        logger.debug(`   Contact[${idx}]: id=${c?.id?._serialized}, pushname="${c?.pushname}", name="${c?.name}", shortName="${c?.shortName}", notify="${c?.notify || c?.notifyName}"`);
                    });
                }
            }
            catch (err) {
                logger.warn(`⚠️ getRecipientContacts() failed: ${err.message}`);
            }
            const notificationBody = notification.body || notification._data?.body || '';
            const notificationData = notification._data || {};
            logger.debug(`📋 Notification body: "${notificationBody}", hasData: ${!!notificationData}`);
            for (let i = 0; i < participantIds.length; i++) {
                const participantId = participantIds[i];
                const idString = extractIdFromWid(participantId);
                let phone = normalizePhone(idString);
                if (!phone && idString && idString.includes('@lid')) {
                    phone = idString;
                }
                let contact = recipientContacts[i] || null;
                const hasValidContactData = contact && ((contact.pushname && contact.pushname !== 'undefined') ||
                    (contact.name && contact.name !== 'undefined') ||
                    (contact.shortName && contact.shortName !== 'undefined') ||
                    (contact.notify && contact.notify !== 'undefined'));
                logger.info(`👤 Member joined (via notification): ${phone} in group ${groupId}`);
                logger.info(`   Contact info: pushname="${contact?.pushname}", name="${contact?.name}", shortName="${contact?.shortName}", notify="${contact?.notify}", hasValidData=${hasValidContactData}`);
                if (phone) {
                    await this.handleMemberJoin(groupId, phone, hasValidContactData ? contact : null);
                }
                else {
                    logger.warn(`⚠️ Could not extract phone/lid from participantId: ${participantId}`);
                }
            }
        }
        catch (error) {
            logger.error('Error handling group join:', error);
        }
    }
    async handleGroupLeave(notification) {
        try {
            logger.info(`👥 Group Leave Notification: ${JSON.stringify(notification)}`);
            const groupId = normalizeGroupId(notification.chatId || notification.id?.remote);
            const participants = notification.recipientIds || [];
            const group = await GroupRepository.getById(groupId);
            if (!group || !group.isActive)
                return;
            for (const participantId of participants) {
                const idString = extractIdFromWid(participantId);
                let phone = normalizePhone(idString);
                if (!phone && idString && idString.includes('@lid')) {
                    phone = idString;
                }
                logger.info(`👤 Member left (via notification): ${phone} in group ${groupId}`);
                if (phone) {
                    await this.handleMemberLeave(groupId, phone);
                }
                else {
                    logger.warn(`⚠️ Could not extract phone/lid from participantId: ${participantId}`);
                }
            }
        }
        catch (error) {
            logger.error('Error handling group leave:', error);
        }
    }
    async handleMemberJoin(groupId, phone, contactFromNotification) {
        try {
            await new Promise(resolve => setTimeout(resolve, 3000));
            let displayName = null;
            let memberCount = 0;
            let contactObject = null;
            try {
                displayName = await MemberService.extractUserProfileName(this.sock, phone, groupId);
                if (!displayName && contactFromNotification) {
                    contactObject = contactFromNotification;
                    const isValid = (n) => n && typeof n === 'string' && n.trim().length > 0 && n !== 'undefined';
                    if (isValid(contactFromNotification.pushname))
                        displayName = contactFromNotification.pushname;
                    else if (isValid(contactFromNotification.notifyName))
                        displayName = contactFromNotification.notifyName;
                    else if (isValid(contactFromNotification.name))
                        displayName = contactFromNotification.name;
                }
                const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
                try {
                    const chat = await this.sock.getChatById(targetJid);
                    if (chat && chat.participants) {
                        memberCount = chat.participants.length;
                        if (!displayName) {
                            const participant = chat.participants.find((p) => {
                                const pId = p?.id?._serialized || p?.id;
                                return pId === phone || normalizePhone(pId) === normalizePhone(phone);
                            });
                            if (participant) {
                                const isValid = (n) => n && typeof n === 'string' && n.trim().length > 0 && n !== 'undefined';
                                if (isValid(participant.pushname))
                                    displayName = participant.pushname;
                                else if (isValid(participant.notify))
                                    displayName = participant.notify;
                                else if (isValid(participant.notifyName))
                                    displayName = participant.notifyName;
                            }
                        }
                    }
                }
                catch (e) {
                    logger.debug(`getChatById failed during join: ${e.message}`);
                }
            }
            catch (err) {
                logger.warn(`Error obteniendo metadata para ${phone}: ${err.message}`);
            }
            if (displayName) {
                logger.info(`👤 ✅ Final displayName: "${displayName}"`);
            }
            else {
                logger.info(`👤 ⚠️ No se encontró nombre válido para ${phone}, usando fallback "Usuario"`);
                displayName = "Usuario";
            }
            try {
                await MemberService.getOrCreateUnified(groupId, phone, this.sock, { authorName: displayName });
            }
            catch (e) {
                logger.debug(`getOrCreateUnified failed: ${e.message}`);
            }
            try {
                const numericPhone = phone.includes('@') ? phone.split('@')[0] : phone;
                const { MemberRepository } = await import('../repositories/MemberRepository.js');
                await MemberRepository.mergeMemberDocs(groupId, numericPhone, phone);
            }
            catch (e) {
                logger.debug(`mergeMemberDocs failed: ${e.message}`);
            }
            try {
                const { WarningService } = await import('../services/WarningService.js');
                await WarningService.resetWarnings(groupId, phone, undefined, 'Ingreso al grupo (reset)');
            }
            catch (e) {
                logger.debug(`resetWarnings on join failed: ${e.message}`);
            }
            await WelcomeService.sendWelcome(this.sock, groupId, phone, displayName, memberCount, contactObject);
        }
        catch (error) {
            logger.error(`Error al manejar ingreso de miembro:`, error);
        }
    }
    async handleMemberLeave(groupId, phone, wasKicked = false) {
        try {
            const member = await MemberService.getMemberInfo(groupId, phone);
            const { WarningService } = await import('../services/WarningService.js');
            await WarningService.logExit(groupId, phone, wasKicked);
            if (member) {
                await MemberService.removeMember(groupId, phone);
                await WelcomeService.sendGoodbye(this.sock, groupId, phone, member.displayName);
            }
            logger.info(`👋 Member exit logged: ${phone} from group ${groupId}, wasKicked=${wasKicked}`);
        }
        catch (error) {
            logger.error(`Error al manejar salida de miembro:`, error);
        }
    }
}
export default EventHandler;
