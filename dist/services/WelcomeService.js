import GroupRepository from '../repositories/GroupRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import WelcomeImageService from './WelcomeImageService.js';
import { replacePlaceholders } from '../utils/formatter.js';
import { config as envConfig } from '../config/environment.js';
import logger from '../lib/logger.js';
import pkg from 'whatsapp-web.js';
const { MessageMedia } = pkg;
export class WelcomeService {
    static async sendWelcome(sock, groupId, phone, displayName, memberCount = null, contactObject = null) {
        try {
            logger.info(`👋 Processing welcome for ${phone} in ${groupId}`);
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
            let contact = contactObject;
            if (!contact) {
                try {
                    contact = await sock.getContactById(phone);
                    logger.debug(`Contact retrieved for ${phone}: pushname=${contact?.pushname}, name=${contact?.name}, shortName=${contact?.shortName}`);
                }
                catch (err) {
                    logger.debug(`Could not get contact for ${phone}: ${err.message}`);
                }
            }
            const isValidDisplayName = (name) => {
                if (!name || typeof name !== 'string')
                    return false;
                const trimmed = name.trim();
                if (!trimmed)
                    return false;
                return /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(trimmed);
            };
            let realUserName = null;
            if (contact) {
                if (isValidDisplayName(contact.pushname)) {
                    realUserName = contact.pushname.trim();
                    logger.debug(`✅ Name from contact.pushname: "${realUserName}"`);
                }
                else if (isValidDisplayName(contact.name)) {
                    realUserName = contact.name.trim();
                    logger.debug(`✅ Name from contact.name: "${realUserName}"`);
                }
                else if (isValidDisplayName(contact.shortName)) {
                    realUserName = contact.shortName.trim();
                    logger.debug(`✅ Name from contact.shortName: "${realUserName}"`);
                }
            }
            if (!realUserName && isValidDisplayName(displayName)) {
                realUserName = displayName.trim();
                logger.debug(`✅ Name from provided displayName: "${realUserName}"`);
            }
            const safeDisplayName = realUserName || null;
            logger.info(`👤 User name resolution: contact.pushname="${contact?.pushname}", contact.name="${contact?.name}", displayName="${displayName}", final="${safeDisplayName}"`);
            let mentionIdForText;
            if (isLid) {
                mentionIdForText = phone.replace('@lid', '');
            }
            else {
                mentionIdForText = phone.replace('@c.us', '').replace('@s.whatsapp.net', '');
            }
            const mentionText = `@${mentionIdForText}`;
            logger.info(`📝 Mention construction: phone=${phone}, idForText=${mentionIdForText}, hasContact=${!!contact}`);
            let message = replacePlaceholders(groupConfig.welcome.message, {
                user: mentionText,
                name: mentionText,
                group: group?.name || 'el grupo',
                count: count
            });
            if (!message || message.trim() === '') {
                message = `¡Bienvenido ${mentionText} al grupo!`;
            }
            let imageBuffer = null;
            logger.info(`🖼️ Welcome image check: envConfig.welcomeImages=${envConfig.features?.welcomeImages}, groupConfig.welcomeImages=${groupConfig.features?.welcomeImages}, cloudinaryUrl=${envConfig.cloudinary?.welcomeBgUrl ? 'SET' : 'NOT SET'}`);
            if (envConfig.features?.welcomeImages && groupConfig.features?.welcomeImages !== false) {
                try {
                    if (!envConfig.cloudinary?.welcomeBgUrl) {
                        logger.warn('Welcome images enabled but no background URL configured in WELCOME_BG_URL');
                    }
                    else {
                        const profilePicUrl = await sock.getProfilePicUrl(phone).catch((err) => {
                            logger.debug(`No profile pic for ${phone}: ${err.message}`);
                            return null;
                        });
                        imageBuffer = await WelcomeImageService.generateWelcomeImage(profilePicUrl || '', safeDisplayName, group?.name || 'el grupo');
                        if (!imageBuffer) {
                            logger.warn('WelcomeImageService returned null - check logs for generation errors');
                        }
                    }
                }
                catch (error) {
                    logger.error(`Error generating welcome image:`, error);
                }
            }
            else {
                logger.debug('Welcome images disabled or not configured');
            }
            const mentions = contact ? [contact] : [phone];
            logger.info(`📤 Sending welcome: message="${message.substring(0, 50)}...", mentions=${JSON.stringify(mentions.map(m => typeof m === 'string' ? m : m.id?._serialized || m.id))}`);
            if (imageBuffer) {
                try {
                    const base64Image = imageBuffer.toString('base64');
                    const media = new MessageMedia('image/png', base64Image, 'welcome.png');
                    await sock.sendMessage(targetJid, media, {
                        caption: message,
                        mentions: mentions
                    });
                    logger.info(`✅ Imagen de bienvenida enviada`);
                }
                catch (error) {
                    logger.warn(`Error al enviar imagen, enviando solo texto:`, error);
                    await sock.sendMessage(targetJid, message, { mentions: mentions });
                }
            }
            else {
                await sock.sendMessage(targetJid, message, { mentions: mentions });
            }
            logger.info(`✅ Bienvenida enviada a ${safeDisplayName} (${phone}) en grupo ${groupId}`);
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
