import GroupRepository from '../repositories/GroupRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import { welcomeImageService } from './WelcomeImageService.js';
import { replacePlaceholders } from '../utils/formatter.js';
import { config as envConfig } from '../config/environment.js';
import { resolveLidToPhone, forceLoadContactData } from '../utils/lid-resolver.js';
import logger from '../lib/logger.js';
import pkg from 'whatsapp-web.js';
const { MessageMedia } = pkg;
export class WelcomeService {
    static async sendWelcome(sock, groupId, phone, displayName, memberCount = null, contactObject = null) {
        const sleep = (ms) => new Promise(res => setTimeout(res, ms));
        try {
            logger.info(`👋 Processing welcome for ${phone} in ${groupId}`);
            const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            let chat = null;
            try {
                chat = await sock.getChatById(targetJid);
            }
            catch (e) {
                logger.warn(`Could not get chat object for ${targetJid}: ${e.message}`);
            }
            const isLid = phone.includes('@lid');
            const waId = isLid ? phone : (phone.includes('@') ? phone : `${phone}@c.us`);
            let finalMentionJid = waId;
            if (isLid) {
                const resolvedPhone = await resolveLidToPhone(sock, groupId, waId);
                if (resolvedPhone) {
                    finalMentionJid = resolvedPhone.includes('@') ? resolvedPhone : `${resolvedPhone}@c.us`;
                    logger.info(`✅ LID ${waId} resuelto a ${finalMentionJid} para bienvenida`);
                }
            }
            const group = await GroupRepository.getById(groupId);
            const groupName = group?.name || 'el grupo';
            const dmJid = finalMentionJid.includes('@') ? finalMentionJid : `${finalMentionJid}@c.us`;
            const dmMessage = `👋 ¡Bienvenido a *${groupName}*!\n\n` +
                `📋 Es importante que leas las reglas del grupo para una mejor convivencia.\n\n` +
                `¡Esperamos que disfrutes tu estadía!`;
            try {
                await sock.sendMessage(dmJid, dmMessage);
                logger.info(`📨 DM de bienvenida enviado a ${dmJid}`);
            }
            catch (dmError) {
                logger.warn(`⚠️ No se pudo enviar DM a ${dmJid}: ${dmError.message}`);
            }
            const TYPING_CYCLES = 2;
            const TYPING_DURATION_MS = 2000;
            const PAUSE_DURATION_MS = 2000;
            const dataLoadPromise = (async () => {
                let name = null;
                await sleep(500);
                const hydratedData = await forceLoadContactData(sock, finalMentionJid, groupId);
                if (hydratedData?.name && hydratedData.name !== 'undefined' && hydratedData.name !== 'Usuario') {
                    name = hydratedData.name;
                    logger.info(`✅ [Welcome Async] Nombre obtenido vía forceLoadContactData: "${name}"`);
                }
                if (!name && displayName && displayName !== 'Usuario' && displayName !== 'Unknown' && displayName !== 'undefined') {
                    name = displayName;
                    logger.info(`✅ [Welcome Async] Nombre obtenido vía displayName: "${name}"`);
                }
                if (!name && contactObject) {
                    const contactName = contactObject.pushname || contactObject.name || contactObject.shortName;
                    if (contactName && contactName !== 'undefined' && contactName !== 'Usuario') {
                        name = contactName;
                        logger.info(`✅ [Welcome Async] Nombre obtenido vía contactObject: "${name}"`);
                    }
                }
                return name;
            })();
            for (let cycle = 0; cycle < TYPING_CYCLES; cycle++) {
                logger.debug(`📝 Typing cycle ${cycle + 1}/${TYPING_CYCLES}`);
                if (chat) {
                    try {
                        await chat.sendStateTyping();
                    }
                    catch (e) { }
                }
                await sleep(TYPING_DURATION_MS);
                if (cycle < TYPING_CYCLES - 1) {
                    if (chat) {
                        try {
                            await chat.clearState();
                        }
                        catch (e) { }
                    }
                    await sleep(PAUSE_DURATION_MS);
                }
            }
            if (chat) {
                try {
                    await chat.clearState();
                }
                catch (e) { }
            }
            const groupConfig = await GroupRepository.getConfig(groupId);
            if (!groupConfig?.welcome?.enabled) {
                logger.info(`ℹ️ Welcome disabled for group ${groupId}`);
                return null;
            }
            let count = memberCount;
            if (!count) {
                const members = await MemberRepository.getActiveMembers(groupId);
                count = members.length;
            }
            let nameForDisplay = await dataLoadPromise;
            let cleanNumberForText;
            if (finalMentionJid.includes('@lid')) {
                cleanNumberForText = finalMentionJid.replace('@lid', '').split(':')[0];
            }
            else {
                cleanNumberForText = finalMentionJid.replace('@c.us', '').replace('@s.whatsapp.net', '');
            }
            if (!nameForDisplay || nameForDisplay === 'Usuario' || nameForDisplay === 'undefined' || nameForDisplay === 'Unknown') {
                nameForDisplay = cleanNumberForText;
                logger.info(`📱 [Welcome] Usando número de teléfono como nombre: "${nameForDisplay}"`);
            }
            const userMentionText = `@${nameForDisplay}`;
            logger.info(`📝 Datos finales: JID=${finalMentionJid}, mention=${userMentionText}, nameForDisplay="${nameForDisplay}"`);
            let message = replacePlaceholders(groupConfig.welcome.message, {
                user: userMentionText,
                usuario: userMentionText,
                name: nameForDisplay,
                nombre: nameForDisplay,
                group: groupName,
                grupo: groupName,
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
                        imageBuffer = await welcomeImageService.createWelcomeImage(waId, nameForDisplay, sock);
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
