import GroupRepository from '../repositories/GroupRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import { welcomeImageService } from './WelcomeImageService.js';
import { replacePlaceholders } from '../utils/formatter.js';
import { config as envConfig } from '../config/environment.js';
import logger from '../lib/logger.js';
import pkg from 'whatsapp-web.js';
const { MessageMedia } = pkg;
export class WelcomeService {
    static async getContactNameWithRetries(sock, waId, retries = 5, delayMs = 500) {
        const sleep = (ms) => new Promise(res => setTimeout(res, ms));
        for (let i = 0; i < retries; i++) {
            try {
                const contact = await sock.getContactById(waId);
                if (contact) {
                    const name = contact.pushname || contact.name || contact.shortName;
                    if (name && name.trim().length > 0) {
                        return { name: name.trim(), contact };
                    }
                }
            }
            catch (err) {
            }
            await sleep(delayMs);
        }
        return null;
    }
    static async getNameForMention(sock, jid) {
        if (!sock?.pupPage)
            return null;
        try {
            const result = await sock.pupPage.evaluate(async (participantJid) => {
                try {
                    const store = window.Store;
                    if (!store)
                        return null;
                    const isValid = (n) => {
                        if (!n || typeof n !== 'string')
                            return false;
                        const t = n.trim();
                        return t.length > 0 && t !== 'undefined' && t.toLowerCase() !== 'null';
                    };
                    if (store.Contact) {
                        const contact = store.Contact.get(participantJid);
                        if (contact) {
                            if (isValid(contact.pushname))
                                return { name: contact.pushname, source: 'Contact.pushname' };
                            if (isValid(contact.verifiedName))
                                return { name: contact.verifiedName, source: 'Contact.verifiedName' };
                            if (isValid(contact.notifyName))
                                return { name: contact.notifyName, source: 'Contact.notifyName' };
                        }
                    }
                    if (store.Chat) {
                        const chat = store.Chat.get(participantJid);
                        if (chat) {
                            if (chat.contact) {
                                if (isValid(chat.contact.pushname))
                                    return { name: chat.contact.pushname, source: 'Chat.contact.pushname' };
                                if (isValid(chat.contact.verifiedName))
                                    return { name: chat.contact.verifiedName, source: 'Chat.contact.verifiedName' };
                            }
                            if (isValid(chat.name))
                                return { name: chat.name, source: 'Chat.name' };
                        }
                    }
                    if (store.GroupMetadata && store.GroupMetadata._index) {
                        for (const [, groupMeta] of store.GroupMetadata._index) {
                            if (groupMeta && groupMeta.participants) {
                                const participants = Array.isArray(groupMeta.participants)
                                    ? groupMeta.participants
                                    : (groupMeta.participants.getModelsArray ? groupMeta.participants.getModelsArray() : []);
                                if (Array.isArray(participants)) {
                                    for (const p of participants) {
                                        const pId = p.id?._serialized || p.id;
                                        if (pId === participantJid) {
                                            if (isValid(p.pushname))
                                                return { name: p.pushname, source: 'GroupMeta.pushname' };
                                            if (isValid(p.notify))
                                                return { name: p.notify, source: 'GroupMeta.notify' };
                                            if (isValid(p.name))
                                                return { name: p.name, source: 'GroupMeta.name' };
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if (store.Msg && store.Msg._index) {
                        for (const [, msg] of store.Msg._index) {
                            const senderId = msg?.senderObj?.id?._serialized || msg?.sender?._serialized || msg?.from;
                            if (senderId === participantJid) {
                                if (isValid(msg.notifyName))
                                    return { name: msg.notifyName, source: 'Msg.notifyName' };
                                if (msg.senderObj && isValid(msg.senderObj.pushname)) {
                                    return { name: msg.senderObj.pushname, source: 'Msg.senderObj.pushname' };
                                }
                            }
                        }
                    }
                    return null;
                }
                catch (e) {
                    return null;
                }
            }, jid);
            if (result && result.name) {
                logger.info(`✅ [getNameForMention] Nombre encontrado (${result.source}): "${result.name}"`);
                return result.name;
            }
            return null;
        }
        catch (err) {
            logger.debug(`[getNameForMention] Error: ${err.message}`);
            return null;
        }
    }
    static async sendWelcome(sock, groupId, phone, displayName, memberCount = null, contactObject = null) {
        const sleep = (ms) => new Promise(res => setTimeout(res, ms));
        try {
            logger.info(`👋 Processing welcome for ${phone} in ${groupId}`);
            await sleep(2000);
            const groupConfig = await GroupRepository.getConfig(groupId);
            if (!groupConfig?.welcome?.enabled) {
                logger.info(`ℹ️ Welcome disabled for group ${groupId}`);
                return null;
            }
            const group = await GroupRepository.getById(groupId);
            let count = memberCount;
            if (!count) {
                const members = await MemberRepository.getActiveMembers(groupId);
                count = members.length;
            }
            const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            const isLid = phone.includes('@lid');
            const waId = isLid ? phone : (phone.includes('@') ? phone : `${phone}@c.us`);
            let contact = contactObject;
            let resolvedPhoneJid = null;
            if (isLid) {
                try {
                    const found = await this.getContactNameWithRetries(sock, waId, 3, 300);
                    if (found && found.contact) {
                        contact = found.contact;
                        if (contact.linkedContactId) {
                            resolvedPhoneJid = contact.linkedContactId;
                        }
                        else if (contact.number && /^\d+$/.test(contact.number)) {
                            resolvedPhoneJid = `${contact.number}@c.us`;
                        }
                    }
                }
                catch (e) { }
            }
            const finalMentionJid = resolvedPhoneJid || waId;
            let cleanNumberForText;
            if (finalMentionJid.includes('@lid')) {
                cleanNumberForText = finalMentionJid.replace('@lid', '').split(':')[0];
            }
            else {
                cleanNumberForText = finalMentionJid.replace('@c.us', '').replace('@s.whatsapp.net', '');
            }
            const userMentionText = `@${cleanNumberForText}`;
            let nameForDisplay = null;
            const jidsToTry = [finalMentionJid];
            if (finalMentionJid !== waId)
                jidsToTry.push(waId);
            if (cleanNumberForText && /^\d+$/.test(cleanNumberForText)) {
                const phoneJid = `${cleanNumberForText}@c.us`;
                if (!jidsToTry.includes(phoneJid))
                    jidsToTry.push(phoneJid);
            }
            if (displayName && /^\d{8,}$/.test(displayName)) {
                const resolvedPhoneJidFromName = `${displayName}@c.us`;
                if (!jidsToTry.includes(resolvedPhoneJidFromName)) {
                    jidsToTry.push(resolvedPhoneJidFromName);
                    if (cleanNumberForText !== displayName) {
                        logger.info(`🔄 [Welcome] Usando número resuelto del displayName: ${displayName} (en lugar de ${cleanNumberForText})`);
                        cleanNumberForText = displayName;
                    }
                }
            }
            for (const jidToTry of jidsToTry) {
                if (!nameForDisplay) {
                    nameForDisplay = await this.getNameForMention(sock, jidToTry);
                    if (nameForDisplay) {
                        logger.info(`✅ [Welcome] Nombre encontrado con JID ${jidToTry}: "${nameForDisplay}"`);
                    }
                }
            }
            if (!nameForDisplay && sock?.pupPage) {
                try {
                    const groupJid = targetJid;
                    const participantJid = waId;
                    const result = await sock.pupPage.evaluate(async (gJid, pJid) => {
                        try {
                            const store = window.Store;
                            if (!store?.GroupMetadata)
                                return null;
                            const groupMeta = store.GroupMetadata.get(gJid);
                            if (!groupMeta?.participants)
                                return null;
                            const participants = Array.isArray(groupMeta.participants)
                                ? groupMeta.participants
                                : (groupMeta.participants.getModelsArray ? groupMeta.participants.getModelsArray() : []);
                            if (Array.isArray(participants)) {
                                for (const p of participants) {
                                    const pId = p.id?._serialized || p.id;
                                    if (pId === pJid || pId?.includes(pJid?.split('@')[0])) {
                                        if (p.pushname)
                                            return p.pushname;
                                        if (p.notify)
                                            return p.notify;
                                        if (p.name)
                                            return p.name;
                                    }
                                }
                            }
                            return null;
                        }
                        catch (e) {
                            return null;
                        }
                    }, groupJid, participantJid);
                    if (result) {
                        nameForDisplay = result;
                        logger.info(`✅ [Welcome] Nombre obtenido de GroupMetadata: "${result}"`);
                    }
                }
                catch (e) {
                }
            }
            if (!nameForDisplay && displayName && displayName !== 'Usuario' && displayName !== 'Unknown' && displayName !== 'undefined') {
                nameForDisplay = displayName;
            }
            if (!nameForDisplay && contact) {
                const contactName = contact.pushname || contact.name || contact.shortName;
                if (contactName && contactName !== 'undefined' && contactName !== 'Usuario') {
                    nameForDisplay = contactName;
                }
            }
            if (!nameForDisplay && sock && cleanNumberForText && /^\d+$/.test(cleanNumberForText)) {
                try {
                    const phoneJid = `${cleanNumberForText}@c.us`;
                    logger.info(`🔍 [Welcome] Intentando getContactById con número resuelto: ${phoneJid}`);
                    const resolvedContact = await sock.getContactById(phoneJid);
                    if (resolvedContact) {
                        const contactName = resolvedContact.pushname || resolvedContact.name || resolvedContact.shortName;
                        if (contactName && contactName !== 'undefined' && contactName !== 'null' && contactName !== 'Usuario') {
                            nameForDisplay = contactName;
                            logger.info(`✅ [Welcome] Nombre obtenido de getContactById(${phoneJid}): "${nameForDisplay}"`);
                        }
                    }
                }
                catch (e) {
                    logger.debug(`[Welcome] getContactById con número resuelto falló: ${e.message}`);
                }
            }
            if (!nameForDisplay || nameForDisplay === 'Usuario' || nameForDisplay === 'undefined' || nameForDisplay === 'Unknown') {
                nameForDisplay = cleanNumberForText;
                logger.info(`📱 [Welcome] Usando número de teléfono como nombre: "${nameForDisplay}"`);
            }
            logger.info(`📝 Datos finales: JID=${finalMentionJid}, mention=${userMentionText}, nameForDisplay="${nameForDisplay}"`);
            let message = replacePlaceholders(groupConfig.welcome.message, {
                user: userMentionText,
                name: nameForDisplay,
                group: group?.name || 'el grupo',
                count: count
            });
            if (!message || message.trim() === '') {
                message = `¡Bienvenido ${userMentionText} al grupo!`;
            }
            const mentions = [finalMentionJid];
            let imageBuffer = null;
            if (envConfig.features?.welcomeImages && groupConfig.features?.welcomeImages !== false) {
                try {
                    if (envConfig.cloudinary?.welcomeBgUrl) {
                        imageBuffer = await welcomeImageService.createWelcomeImage(finalMentionJid, nameForDisplay, sock);
                    }
                }
                catch (error) {
                    logger.error(`Error generating welcome image:`, error);
                }
            }
            if (imageBuffer) {
                try {
                    const base64Image = imageBuffer.toString('base64');
                    const media = new MessageMedia('image/png', base64Image, 'welcome.png');
                    await sock.sendMessage(targetJid, media, {
                        caption: message,
                        mentions: mentions
                    });
                    logger.info(`✅ Imagen de bienvenida enviada a "${nameForDisplay}"`);
                }
                catch (error) {
                    logger.warn(`Error al enviar imagen, enviando solo texto:`, error);
                    await sock.sendMessage(targetJid, message, { mentions: mentions });
                }
            }
            else {
                await sock.sendMessage(targetJid, message, { mentions: mentions });
            }
            return message;
        }
        catch (error) {
            logger.error(`Error al enviar bienvenida:`, error);
            return null;
        }
    }
    static async sendGoodbye(sock, groupId, phone, displayName) {
        try {
            const config = await GroupRepository.getConfig(groupId);
            if (!config?.goodbye?.enabled) {
                return null;
            }
            const group = await GroupRepository.getById(groupId);
            const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            const message = replacePlaceholders(config.goodbye.message, {
                name: displayName,
                group: group?.name || 'el grupo'
            });
            await sock.sendMessage(targetJid, {
                text: message
            });
            logger.info(`Despedida enviada a ${displayName} en grupo ${groupId}`);
            return message;
        }
        catch (error) {
            logger.error(`Error al enviar despedida:`, error);
            return null;
        }
    }
}
export default WelcomeService;
