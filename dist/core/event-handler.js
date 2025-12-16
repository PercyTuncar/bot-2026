import { isJidGroup, getContentType } from '@whiskeysockets/baileys';
import CommandDispatcher from './command-dispatcher.js';
import MessageRouter from './message-router.js';
import MessageService from '../services/MessageService.js';
import PointsService from '../services/PointsService.js';
import MemberService from '../services/MemberService.js';
import WelcomeService from '../services/WelcomeService.js';
import ModerationService from '../services/ModerationService.js';
import GroupRepository from '../repositories/GroupRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import { normalizeGroupId } from '../utils/phone.js';
import logger from '../lib/logger.js';
export class EventHandler {
    sock;
    processedMessages;
    processedWelcomes;
    constructor(sock) {
        this.sock = sock;
        this.processedMessages = new Map();
        this.processedWelcomes = new Map();
        setInterval(() => {
            const now = Date.now();
            for (const [key, timestamp] of this.processedMessages.entries()) {
                if (now - timestamp > 2 * 60 * 1000) {
                    this.processedMessages.delete(key);
                }
            }
            for (const [key, timestamp] of this.processedWelcomes.entries()) {
                if (now - timestamp > 2 * 60 * 1000) {
                    this.processedWelcomes.delete(key);
                }
            }
        }, 60 * 1000);
        this.setupEventListeners();
    }
    setupEventListeners() {
        this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify')
                return;
            for (const msg of messages) {
                await this.handleMessage(msg);
            }
        });
        this.sock.ev.on('group-participants.update', async (update) => {
            await this.handleGroupParticipantsUpdate(update);
        });
        this.sock.ev.on('groups.update', async (updates) => {
            for (const update of updates) {
                await this.handleGroupUpdate(update);
            }
        });
        this.sock.ev.on('contacts.update', async (updates) => {
            for (const update of updates) {
                await this.handleContactUpdate(update);
            }
        });
        logger.info('✅ Eventos de Baileys registrados correctamente');
    }
    getMessageText(msg) {
        const message = msg.message;
        if (!message)
            return '';
        const type = getContentType(message);
        if (type === 'conversation') {
            return message.conversation || '';
        }
        if (type === 'extendedTextMessage') {
            return message.extendedTextMessage?.text || '';
        }
        if (type === 'imageMessage') {
            return message.imageMessage?.caption || '';
        }
        if (type === 'videoMessage') {
            return message.videoMessage?.caption || '';
        }
        if (type === 'documentMessage') {
            return message.documentMessage?.caption || '';
        }
        return '';
    }
    getSender(msg) {
        const isGroup = isJidGroup(msg.key.remoteJid || '');
        if (isGroup) {
            return msg.key.participant || '';
        }
        if (msg.key.fromMe) {
            return this.sock.user?.id || '';
        }
        return msg.key.remoteJid || '';
    }
    jidToPhone(jid) {
        if (!jid)
            return '';
        return jid.split('@')[0].split(':')[0];
    }
    async handleMessage(msg) {
        try {
            if (msg.key.remoteJid === 'status@broadcast')
                return;
            const messageId = msg.key.id || `${msg.messageTimestamp}_${msg.key.remoteJid}`;
            if (this.processedMessages.has(messageId)) {
                return;
            }
            this.processedMessages.set(messageId, Date.now());
            const text = this.getMessageText(msg);
            const chatId = msg.key.remoteJid || '';
            const isGroup = isJidGroup(chatId);
            const groupId = isGroup ? normalizeGroupId(chatId) : null;
            let senderJid = this.getSender(msg);
            if (senderJid.includes('@lid')) {
                try {
                    const lidMap = this.sock.signalRepository?.lidMapping;
                    if (lidMap) {
                        const pnJid = await lidMap.getPNForLID(senderJid);
                        if (pnJid) {
                            const prevLid = senderJid;
                            senderJid = pnJid;
                            logger.info(`🔄 [LID Resolver] Mapeo automático en mensaje: LID ${prevLid.split('@')[0]} -> Phone ${senderJid.split('@')[0]}`);
                        }
                    }
                }
                catch (e) {
                    logger.warn(`⚠️ [LID Resolver] Falló resolución para ${senderJid}`);
                }
            }
            let userPhone = this.jidToPhone(senderJid);
            if (!userPhone && !msg.key.fromMe) {
                logger.warn(`⚠️ No se pudo extraer identificador del mensaje.`);
                return;
            }
            if (text.trim().startsWith('.')) {
                logger.info(`📨 Comando recibido: "${text}" de ${userPhone} (${isGroup ? 'grupo' : 'DM'})`);
            }
            const botPhone = this.jidToPhone(this.sock.user?.id || '');
            const isOwner = botPhone && userPhone === botPhone;
            const isCommand = text.trim().startsWith('.');
            if (msg.key.fromMe && isOwner && !isCommand) {
                return;
            }
            if (isOwner && isCommand) {
                logger.info(`👤 Owner enviando comando: "${text}"`);
            }
            if (!isCommand && text.trim().length > 0) {
                logger.info(`💬 Mensaje de ${userPhone} (${isGroup ? 'grupo' : 'DM'}): "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
            }
            const compatMsg = this.createCompatibleMessage(msg, text, userPhone);
            const routeResult = await MessageRouter.route(compatMsg);
            if (routeResult.isCommand) {
                logger.info(`🔍 Comando detectado: "${text}" → ${routeResult.parsed?.command || 'desconocido'}`);
            }
            if (routeResult.isGroup) {
                const group = await GroupRepository.getById(routeResult.groupId);
                logger.info(`📊 Group check: groupId=${routeResult.groupId}, exists=${!!group}, isActive=${group?.isActive}`);
                if (group && group.isActive) {
                    const authorName = msg.pushName || userPhone;
                    logger.info(`👤 Getting or creating member: userId=${userPhone}, name=${authorName}`);
                    await MemberService.getOrCreateUnified(routeResult.groupId, userPhone, this.sock, { authorName });
                    if (!routeResult.isCommand) {
                        const groupConfig = await GroupRepository.getConfig(routeResult.groupId);
                        const config = groupConfig || group?.config || {};
                        const spamCheck = await ModerationService.checkAntiSpam(userPhone, routeResult.groupId, config);
                        if (spamCheck.violation) {
                            await ModerationService.handleViolation(this.sock, compatMsg, spamCheck, routeResult.groupId, userPhone);
                            return;
                        }
                        const bannedWordsCheck = await ModerationService.checkBannedWords(routeResult.groupId, text, config);
                        if (bannedWordsCheck.violation) {
                            await ModerationService.handleViolation(this.sock, compatMsg, bannedWordsCheck, routeResult.groupId, userPhone);
                            return;
                        }
                        const antiLinkCheck = await ModerationService.checkAntiLink(routeResult.groupId, text, config);
                        if (antiLinkCheck.violation) {
                            await ModerationService.handleViolation(this.sock, compatMsg, antiLinkCheck, routeResult.groupId, userPhone);
                            return;
                        }
                    }
                    logger.info(`💾 Saving message: groupId=${routeResult.groupId}, author=${userPhone}, isCommand=${routeResult.isCommand}`);
                    await MessageService.saveMessage(routeResult.groupId, compatMsg, routeResult.isCommand, userPhone, this.sock);
                    logger.info(`✅ Message saved successfully`);
                    const commandName = routeResult.parsed?.command;
                    const shouldCountForPoints = !routeResult.isCommand || commandName === 'mypoints';
                    if (shouldCountForPoints) {
                        logger.info(`🎯 Processing points for: groupId=${routeResult.groupId}, userId=${userPhone}`);
                        const pointsResult = await PointsService.processMessage(routeResult.groupId, compatMsg, userPhone);
                        logger.info(`✅ Points processed: ${pointsResult ? 'success' : 'null'}`);
                        if (pointsResult?.pointsAdded) {
                            try {
                                const mentions = [senderJid];
                                await this.sock.sendMessage(chatId, {
                                    text: `@${userPhone} ${pointsResult.message}`,
                                    mentions
                                });
                                if (pointsResult.levelUp?.leveled) {
                                    await this.sock.sendMessage(chatId, {
                                        text: `@${userPhone} ${pointsResult.levelUp.message}`,
                                        mentions
                                    });
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
                await MessageService.savePrivateMessage(userPhone, compatMsg, routeResult.isCommand);
            }
            if (routeResult.isCommand) {
                await CommandDispatcher.dispatch({
                    msg: compatMsg,
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
    createCompatibleMessage(msg, text, userPhone) {
        const chatId = msg.key.remoteJid || '';
        const isGroup = isJidGroup(chatId);
        const senderJid = this.getSender(msg);
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
        const quotedStanzaId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        return {
            id: {
                id: msg.key.id,
                _serialized: msg.key.id,
                fromMe: msg.key.fromMe
            },
            from: chatId,
            to: chatId,
            author: senderJid,
            body: text,
            type: getContentType(msg.message || {}) || 'text',
            timestamp: Number(msg.messageTimestamp) || Date.now(),
            hasMedia: !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.documentMessage),
            fromMe: msg.key.fromMe || false,
            pushName: msg.pushName || userPhone,
            mentionedIds: msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
            hasQuotedMsg: !!quotedMsg,
            key: msg.key,
            message: msg.message,
            _data: {
                participant: senderJid,
                from: chatId,
                pushName: msg.pushName,
                quotedMsg: quotedMsg ? {
                    id: quotedStanzaId,
                    participant: quotedParticipant,
                    message: quotedMsg
                } : null
            },
            getChat: async () => {
                if (isGroup) {
                    return await this.sock.groupMetadata(chatId);
                }
                return null;
            },
            getQuotedMessage: async () => {
                if (!quotedMsg)
                    return null;
                return {
                    id: { _serialized: quotedStanzaId, id: quotedStanzaId },
                    body: quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '',
                    author: quotedParticipant,
                    from: chatId,
                    hasMedia: !!(quotedMsg.imageMessage || quotedMsg.videoMessage),
                    type: getContentType(quotedMsg) || 'text',
                    delete: async (forEveryone) => {
                        if (forEveryone && quotedStanzaId) {
                            await this.sock.sendMessage(chatId, {
                                delete: {
                                    remoteJid: chatId,
                                    fromMe: false,
                                    id: quotedStanzaId,
                                    participant: quotedParticipant
                                }
                            });
                        }
                    }
                };
            },
            react: async (emoji) => {
                await this.sock.sendMessage(chatId, {
                    react: { text: emoji, key: msg.key }
                });
            },
            delete: async (forEveryone) => {
                if (forEveryone) {
                    await this.sock.sendMessage(chatId, { delete: msg.key });
                }
            },
            getContact: async () => {
                return {
                    id: { _serialized: senderJid, user: userPhone },
                    pushname: msg.pushName,
                    number: userPhone,
                    name: msg.pushName
                };
            }
        };
    }
    async handleGroupParticipantsUpdate(update) {
        try {
            logger.info(`👥 Group Participants Update: action=${update.action} in ${update.id}`);
            const { id: groupJid, participants, action } = update;
            const groupId = normalizeGroupId(groupJid);
            const group = await GroupRepository.getById(groupId);
            if (!group) {
                logger.warn(`⚠️ Group not found in DB for update: ${groupId}`);
                return;
            }
            if (!group.isActive) {
                logger.info(`ℹ️ Group ${groupId} is not active, ignoring participant update`);
                return;
            }
            for (const participantJid of participants) {
                const phone = this.jidToPhone(participantJid);
                if (action === 'add') {
                    if (phone) {
                        logger.info(`👤 Member joined: ${phone} in group ${groupId}`);
                        await this.handleMemberJoin(groupId, phone, participantJid);
                    }
                }
                else if (action === 'remove') {
                    if (phone) {
                        logger.info(`👤 Member left: ${phone} in group ${groupId}`);
                        await this.handleMemberLeave(groupId, phone);
                    }
                }
                else if (action === 'promote') {
                    if (phone) {
                        logger.info(`👤 Member promoted to admin: ${phone} in group ${groupId}`);
                    }
                }
                else if (action === 'demote') {
                    if (phone) {
                        logger.info(`👤 Member demoted from admin: ${phone} in group ${groupId}`);
                    }
                }
            }
        }
        catch (error) {
            logger.error('Error al manejar cambio de participantes:', error);
        }
    }
    async handleMemberJoin(groupId, phone, participantJid) {
        const { contactStore } = await import('./whatsapp-client.js');
        try {
            const welcomeKey = `${groupId}_${phone}_welcome`;
            const now = Date.now();
            const lastWelcome = this.processedWelcomes.get(welcomeKey);
            if (lastWelcome && (now - lastWelcome < 60 * 1000)) {
                logger.info(`🚫 Bienvenida duplicada ignorada para ${phone} en ${groupId}`);
                return;
            }
            this.processedWelcomes.set(welcomeKey, now);
            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            const groupJid = `${groupId}@g.us`;
            const isRealPhone = (num) => {
                const clean = num.replace(/\D/g, '');
                return /^\d{10,13}$/.test(clean);
            };
            let realPhone = phone;
            let displayName = null;
            let memberCount = 0;
            let profilePicUrl = null;
            let isLID = participantJid.includes('@lid') || !isRealPhone(phone);
            logger.info(`👤 [ARIA] Processing: jid=${participantJid}, phone=${phone}, isLID=${isLID}`);
            try {
                await this.sock.sendPresenceUpdate('composing', groupJid);
                logger.info(`⌨️ Typing indicator sent`);
            }
            catch (e) { }
            displayName = contactStore?.getName(participantJid) || null;
            if (displayName) {
                logger.info(`📒 [ARIA] Name from store: "${displayName}"`);
            }
            if (isLID) {
                try {
                    const lidMapping = this.sock.signalRepository?.lidMapping;
                    if (lidMapping && typeof lidMapping.getPNForLID === 'function') {
                        const pnJid = await lidMapping.getPNForLID(participantJid);
                        if (pnJid) {
                            const pnNumber = pnJid.split('@')[0].split(':')[0];
                            if (isRealPhone(pnNumber)) {
                                realPhone = pnNumber;
                                isLID = false;
                                logger.info(`📱 [ARIA] LID resolved via lidMapping: ${phone} -> ${realPhone}`);
                                if (!displayName) {
                                    displayName = contactStore?.getName(pnJid) || null;
                                }
                            }
                        }
                    }
                }
                catch (e) {
                    logger.debug(`[ARIA] lidMapping check failed: ${e.message}`);
                }
            }
            logger.info(`⏳ [ARIA] Waiting 4s for contact sync...`);
            await sleep(4000);
            if (!displayName) {
                displayName = contactStore?.getName(participantJid) || null;
                if (displayName) {
                    logger.info(`📒 [ARIA] Name from store (after wait): "${displayName}"`);
                }
            }
            try {
                const metadata = await this.sock.groupMetadata(groupJid);
                memberCount = metadata.participants.length;
                for (const p of metadata.participants) {
                    const pNumber = p.id.split('@')[0].split(':')[0];
                    if (p.id === participantJid || p.id.includes(phone)) {
                        if (isRealPhone(pNumber)) {
                            realPhone = pNumber;
                            isLID = false;
                            logger.info(`📱 [ARIA] Found real phone in metadata: ${phone} -> ${realPhone}`);
                            break;
                        }
                    }
                }
                if (isLID) {
                    const lidLast4 = phone.slice(-4);
                    for (const p of metadata.participants) {
                        const pNumber = p.id.split('@')[0].split(':')[0];
                        if (isRealPhone(pNumber) && pNumber.endsWith(lidLast4)) {
                            realPhone = pNumber;
                            isLID = false;
                            logger.info(`📱 [ARIA] Matched by last 4 digits: ${phone} -> ${realPhone}`);
                            break;
                        }
                    }
                }
            }
            catch (e) {
                logger.warn(`⚠️ [ARIA] Could not get group metadata: ${e.message}`);
            }
            if (!isLID && isRealPhone(realPhone)) {
                try {
                    const [result] = await this.sock.onWhatsApp(`${realPhone}@s.whatsapp.net`);
                    if (result && result.exists) {
                        logger.info(`📱 [ARIA] onWhatsApp confirmed: ${realPhone}`);
                    }
                }
                catch (e) { }
            }
            if (!isLID && isRealPhone(realPhone)) {
                for (let i = 0; i < 3 && !profilePicUrl; i++) {
                    try {
                        profilePicUrl = await this.sock.profilePictureUrl(`${realPhone}@s.whatsapp.net`, 'image');
                        if (profilePicUrl) {
                            logger.info(`📷 [ARIA] Profile pic found on attempt ${i + 1}`);
                            break;
                        }
                    }
                    catch (e) {
                        const statusCode = e?.output?.statusCode || e?.data?.statusCode;
                        if (statusCode === 401 || statusCode === 403) {
                            logger.debug(`📷 [ARIA] Privacy restricted for ${realPhone}`);
                            break;
                        }
                        else if (statusCode === 404) {
                            logger.debug(`📷 [ARIA] No profile pic for ${realPhone}`);
                            break;
                        }
                        if (i < 2)
                            await sleep(1000);
                    }
                }
            }
            try {
                await this.sock.sendPresenceUpdate('paused', groupJid);
            }
            catch (e) { }
            const finalDisplayName = displayName || (isLID ? 'Nuevo Miembro' : realPhone);
            logger.info(`👋 [ARIA] Sending welcome: phone=${realPhone}, isLID=${isLID}, name="${finalDisplayName}", memberCount=${memberCount}, pic=${profilePicUrl ? 'YES' : 'NO'}`);
            await WelcomeService.sendWelcomeWithData(this.sock, groupId, realPhone, finalDisplayName, memberCount, profilePicUrl);
        }
        catch (error) {
            logger.error(`[ARIA] Error al manejar ingreso de miembro:`, error);
        }
    }
    async handleMemberLeave(groupId, phone, wasKicked = false) {
        try {
            const member = await MemberService.getMemberInfo(groupId, phone);
            const { WarningService } = await import('../services/WarningService.js');
            await WarningService.logExit(groupId, phone, wasKicked);
            if (member) {
                await MemberService.removeMember(groupId, phone);
                let count = 0;
                try {
                    const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
                    const metadata = await this.sock.groupMetadata(targetJid);
                    count = metadata.participants.length;
                }
                catch (e) {
                    const members = await MemberRepository.getActiveMembers(groupId);
                    count = members.length;
                }
                await WelcomeService.sendGoodbye(this.sock, groupId, phone, member.displayName, count);
            }
            logger.info(`👋 Member exit logged: ${phone} from group ${groupId}`);
        }
        catch (error) {
            logger.error(`Error al manejar salida de miembro:`, error);
        }
    }
    async handleGroupUpdate(update) {
        try {
            const groupJid = update.id;
            if (!groupJid)
                return;
            const groupId = normalizeGroupId(groupJid);
            logger.info(`[GROUP_UPDATE] Grupo ${groupId} actualizado`);
            const metadata = await this.sock.groupMetadata(groupJid);
            await GroupRepository.update(groupId, {
                name: metadata.subject,
                description: metadata.desc || '',
                restrict: metadata.restrict || false,
                announce: metadata.announce || false,
                updatedAt: new Date().toISOString()
            });
            logger.info(`[GROUP_UPDATE] Metadatos actualizados para grupo ${groupId}`);
        }
        catch (error) {
            logger.error(`[GROUP_UPDATE] Error al actualizar grupo:`, error);
        }
    }
    async handleContactUpdate(update) {
        try {
            const contactId = update.id;
            if (!contactId)
                return;
            const phone = this.jidToPhone(contactId);
            if (!phone)
                return;
            logger.info(`[CONTACT_CHANGED] Contacto ${phone} actualizado`);
        }
        catch (error) {
            logger.error(`[CONTACT_CHANGED] Error al actualizar contacto:`, error);
        }
    }
}
export default EventHandler;
