import GroupRepository from '../repositories/GroupRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import { welcomeImageService } from './WelcomeImageService.js';
import { replacePlaceholders } from '../utils/formatter.js';
import { config as envConfig } from '../config/environment.js';
import logger from '../lib/logger.js';
export class WelcomeService {
    static async sendWelcome(sock, groupId, phone, displayName, memberCount = null, contactObject = null) {
        const sleep = (ms) => new Promise(res => setTimeout(res, ms));
        try {
            logger.info(`👋 Processing welcome for ${phone} in ${groupId}`);
            const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            let count = memberCount;
            if (!count) {
                try {
                    const metadata = await sock.groupMetadata(targetJid);
                    count = metadata.participants.length;
                }
                catch (e) {
                    const members = await MemberRepository.getActiveMembers(groupId);
                    count = members.length;
                }
            }
            const cleanNumber = phone
                .replace('@s.whatsapp.net', '')
                .replace('@c.us', '')
                .replace('@lid', '')
                .split(':')[0]
                .replace(/\D/g, '');
            const userJid = `${cleanNumber}@s.whatsapp.net`;
            logger.info(`👋 JID prepared: phone="${phone}" -> cleanNumber="${cleanNumber}" -> userJid="${userJid}"`);
            const group = await GroupRepository.getById(groupId);
            const groupName = group?.name || 'el grupo';
            try {
                await sock.sendPresenceUpdate('composing', targetJid);
            }
            catch (e) { }
            const dmJid = userJid;
            const dmImageUrl = 'https://res.cloudinary.com/dz1qivt7m/image/upload/v1765843159/anuncio_oficial_ultra_peru_PRECIOS-min_cuycvk.png';
            const dmMessage = `¡Hola! Bienvenido a *RaveHub* 👋👽

Te cuento que *ya puedes adquirir tus entradas* para el **Ultra Perú** directamente con nosotros. 🔥

Lo mejor de esta etapa Early Bird:
✅ Puedes reservar tu entrada *desde hoy con solo S/. 50*.
✅ Tienes la opción de pagar el resto en **3 cuotas mensuales**.

⚠️ _Por favor, no olvides leer las reglas del grupo para una mejor convivencia._`;
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                const dmImageRes = await fetch(dmImageUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (dmImageRes.ok) {
                    const dmImageBuffer = Buffer.from(await dmImageRes.arrayBuffer());
                    await sock.sendMessage(dmJid, {
                        image: dmImageBuffer,
                        caption: dmMessage
                    });
                    logger.info(`📨 DM con imagen enviado a ${dmJid}`);
                }
                else {
                    await sock.sendMessage(dmJid, { text: dmMessage });
                    logger.info(`📨 DM (solo texto) enviado a ${dmJid}`);
                }
            }
            catch (e) {
                try {
                    await sock.sendMessage(dmJid, { text: dmMessage });
                    logger.info(`📨 DM (fallback texto) enviado a ${dmJid}`);
                }
                catch (e2) {
                    logger.warn(`⚠️ Error enviando DM a ${dmJid}: ${e2.message}`);
                }
            }
            let nameForDisplay = displayName;
            const isValidName = (n) => {
                if (!n || typeof n !== 'string')
                    return false;
                const t = n.trim();
                if (/^\d{10,}$/.test(t))
                    return false;
                return t.length > 0 && t !== 'undefined' && t !== 'null' && t !== 'Unknown' && t !== 'Usuario';
            };
            if (!nameForDisplay || !isValidName(nameForDisplay)) {
                nameForDisplay = cleanNumber;
            }
            let profilePicUrl = null;
            try {
                profilePicUrl = await Promise.race([
                    sock.profilePictureUrl(userJid, 'image'),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
                ]);
            }
            catch (e) {
            }
            try {
                await sock.sendPresenceUpdate('paused', targetJid);
            }
            catch (e) { }
            const groupConfig = await GroupRepository.getConfig(groupId);
            if (!groupConfig?.welcome?.enabled)
                return null;
            const userMentionText = `@${cleanNumber}`;
            logger.info(`👋 Mention format: userMentionText="${userMentionText}", userJid="${userJid}"`);
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
            const mentions = [userJid];
            logger.info(`👋 Welcome message: "${message.substring(0, 50)}...", mentions=[${mentions.join(', ')}]`);
            let imageBuffer = null;
            if (envConfig.features?.welcomeImages && groupConfig.features?.welcomeImages !== false) {
                try {
                    if (envConfig.cloudinary?.welcomeBgUrl) {
                        logger.info(`🖼️ Generating welcome image for ${nameForDisplay}`);
                        imageBuffer = await welcomeImageService.createWelcomeImageWithPhoto(cleanNumber, nameForDisplay || cleanNumber, profilePicUrl, sock);
                        if (imageBuffer) {
                            logger.info(`🖼️ Welcome image generated: ${imageBuffer.length} bytes`);
                        }
                    }
                }
                catch (error) {
                    logger.error(`Error generating welcome image:`, error.message);
                }
            }
            if (imageBuffer) {
                try {
                    await sock.sendMessage(targetJid, {
                        image: imageBuffer,
                        caption: message,
                        mentions
                    });
                    logger.info(`✅ Imagen de bienvenida enviada a "${nameForDisplay}"`);
                }
                catch (error) {
                    logger.warn(`⚠️ Error enviando imagen, fallback a texto`);
                    await sock.sendMessage(targetJid, { text: message, mentions });
                }
            }
            else {
                await sock.sendMessage(targetJid, { text: message, mentions });
                logger.info(`✅ Mensaje de bienvenida (sin imagen) enviado a "${nameForDisplay}"`);
            }
            return message;
        }
        catch (error) {
            logger.error(`Error al enviar bienvenida:`, error.message);
            return null;
        }
    }
    static async sendWelcomeWithData(sock, groupId, phone, displayName, memberCount = null, profilePicUrl = null) {
        try {
            logger.info(`👋 sendWelcomeWithData: phone=${phone}, displayName=${displayName}, profilePic=${profilePicUrl ? 'YES' : 'NO'}`);
            const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            let cleanNumber = phone
                .replace('@s.whatsapp.net', '')
                .replace('@c.us', '')
                .replace('@lid', '')
                .replace(/\D/g, '');
            if (cleanNumber.length >= 14 || phone.includes('@lid')) {
                logger.info(`🔍 [WelcomeService] Detected potential LID: ${cleanNumber}. Attempting resolution...`);
                let resolved = false;
                try {
                    const lidMap = sock.signalRepository?.lidMapping;
                    if (lidMap) {
                        const lidJid = phone.includes('@lid') ? phone : `${cleanNumber}@lid`;
                        const pnJid = await lidMap.getPNForLID(lidJid);
                        if (pnJid) {
                            const resolvedPn = pnJid.split('@')[0].split(':')[0];
                            logger.info(`✅ [WelcomeService] LID RESOLVED via lidMapping: ${cleanNumber} -> ${resolvedPn}`);
                            cleanNumber = resolvedPn;
                            resolved = true;
                        }
                    }
                }
                catch (e) {
                    logger.debug(`[WelcomeService] lidMapping failed: ${e}`);
                }
                if (!resolved && displayName && displayName.length > 2) {
                    try {
                        logger.info(`🔍 [WelcomeService] Trying metadata fallback with name: "${displayName}"`);
                        const metadata = await sock.groupMetadata(targetJid);
                        for (const p of metadata.participants) {
                            const pNumber = p.id.split('@')[0].split(':')[0];
                            const isRealPhone = !p.id.includes('@lid') && pNumber.length >= 7 && pNumber.length <= 15;
                            const pName = p.notify || p.pushName || '';
                            if (isRealPhone && pName.toLowerCase().includes(displayName.toLowerCase().substring(0, 5))) {
                                cleanNumber = pNumber;
                                logger.info(`✅ [WelcomeService] LID RESOLVED via METADATA (name match): "${displayName}" -> ${pNumber}`);
                                resolved = true;
                                break;
                            }
                        }
                        if (!resolved) {
                            logger.warn(`⚠️ [WelcomeService] Could not resolve LID via metadata. Using displayName for mention.`);
                        }
                    }
                    catch (e) {
                        logger.warn(`⚠️ [WelcomeService] Metadata fallback failed: ${e}`);
                    }
                }
                if (!resolved) {
                    logger.warn(`⚠️ [WelcomeService] LID UNRESOLVED. Mention may not work correctly.`);
                }
            }
            else {
                logger.info(`ℹ️ [WelcomeService] Phone appears valid (not LID): ${cleanNumber}`);
            }
            const isLidForDm = cleanNumber.length >= 14;
            let userJid = isLidForDm
                ? `${cleanNumber}@lid`
                : `${cleanNumber}@s.whatsapp.net`;
            logger.info(`🎯 [WelcomeService] Final Target JID for DM: ${userJid} (isLID=${isLidForDm})`);
            const group = await GroupRepository.getById(groupId);
            const groupName = group?.name || 'el grupo';
            let count = memberCount;
            if (!count) {
                try {
                    const metadata = await sock.groupMetadata(targetJid);
                    count = metadata.participants.length;
                    logger.info(`👥 [WelcomeService] Fetched live member count: ${count}`);
                }
                catch (e) {
                    const members = await MemberRepository.getActiveMembers(groupId);
                    count = members.length;
                    logger.warn(`⚠️ [WelcomeService] Metadata failed, used DB count: ${count}`);
                }
            }
            const dmImageUrl = 'https://res.cloudinary.com/dz1qivt7m/image/upload/v1765843159/anuncio_oficial_ultra_peru_PRECIOS-min_cuycvk.png';
            const dmMessage = `¡Hola! Bienvenido a *RaveHub* 👋👽

Te cuento que *ya puedes adquirir tus entradas* para el **Ultra Perú** directamente con nosotros. 🔥

Lo mejor de esta etapa Early Bird:
✅ Puedes reservar tu entrada *desde hoy con solo S/. 50*.
✅ Tienes la opción de pagar el resto en **3 cuotas mensuales**.

⚠️ _Por favor, no olvides leer las reglas del grupo para una mejor convivencia._`;
            try {
                const dmResponse = await fetch(dmImageUrl);
                if (dmResponse.ok) {
                    const dmBuffer = Buffer.from(await dmResponse.arrayBuffer());
                    await sock.sendMessage(userJid, { image: dmBuffer, caption: dmMessage });
                    logger.info(`📨 DM con imagen enviado a ${userJid}`);
                }
                else {
                    throw new Error('Image fetch failed');
                }
            }
            catch (e) {
                logger.warn(`⚠️ Error enviando DM con imagen (fallback a texto): ${e.message}`);
                try {
                    await sock.sendMessage(userJid, { text: dmMessage });
                }
                catch (e2) { }
            }
            let nameForDisplay = displayName;
            const isValidName = (n) => {
                if (!n || typeof n !== 'string')
                    return false;
                const t = n.trim();
                if (/^\d{10,}$/.test(t))
                    return false;
                return t.length > 0 && t !== 'undefined' && t !== 'null' && t !== 'Unknown' && t !== 'Usuario';
            };
            if (!nameForDisplay || !isValidName(nameForDisplay)) {
                nameForDisplay = cleanNumber;
            }
            const groupConfig = await GroupRepository.getConfig(groupId);
            if (!groupConfig?.welcome?.enabled) {
                logger.info(`ℹ️ Welcome disabled for group ${groupId}`);
                return null;
            }
            const isUnresolvedLid = cleanNumber.length >= 14;
            let userMentionText;
            let mentions = [];
            if (isUnresolvedLid) {
                const lidJid = `${cleanNumber}@lid`;
                userMentionText = `@${cleanNumber}`;
                mentions = [lidJid];
                logger.info(`📍 [WelcomeService] LID Mention: text="${userMentionText}", jid="${lidJid}"`);
            }
            else {
                userMentionText = `@${cleanNumber}`;
                mentions = [userJid];
                logger.info(`✅ [WelcomeService] Real Mention: text="${userMentionText}", jid="${userJid}"`);
            }
            logger.info(`👋 Mention: text="${userMentionText}", jid="${mentions[0]}", hasMention=${mentions.length > 0}`);
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
            let imageBuffer = null;
            if (groupConfig.welcome?.imageUrl) {
                try {
                    logger.info(`⬇️ Descargando imagen estática de bienvenida: ${groupConfig.welcome.imageUrl}`);
                    const res = await fetch(groupConfig.welcome.imageUrl);
                    if (res.ok) {
                        imageBuffer = Buffer.from(await res.arrayBuffer());
                        logger.info(`✅ Imagen estática descargada: ${imageBuffer.length} bytes`);
                    }
                    else {
                        logger.warn(`⚠️ Error HTTP ${res.status} al descargar imagen estática`);
                    }
                }
                catch (error) {
                    logger.error(`❌ Error descargando imagen estática:`, error.message);
                }
            }
            else {
                logger.info(`ℹ️ No se ha configurado imagen estática (.welcome set ... URL), se enviará solo texto.`);
            }
            if (imageBuffer) {
                try {
                    await sock.sendMessage(targetJid, {
                        image: imageBuffer,
                        caption: message,
                        mentions
                    });
                    logger.info(`✅ Imagen de bienvenida enviada a "${nameForDisplay}"`);
                }
                catch (error) {
                    logger.warn(`⚠️ Error enviando imagen, fallback a texto`);
                    await sock.sendMessage(targetJid, { text: message, mentions });
                }
            }
            else {
                await sock.sendMessage(targetJid, { text: message, mentions });
                logger.info(`✅ Mensaje de bienvenida (sin imagen) enviado a "${nameForDisplay}"`);
            }
            return message;
        }
        catch (error) {
            logger.error(`Error en sendWelcomeWithData:`, error.message);
            return null;
        }
    }
    static async sendGoodbye(sock, groupId, phone, displayName, memberCount = null) {
        try {
            const config = await GroupRepository.getConfig(groupId);
            if (!config?.goodbye?.enabled) {
                return null;
            }
            const group = await GroupRepository.getById(groupId);
            const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            let count = memberCount;
            if (!count) {
                try {
                    const metadata = await sock.groupMetadata(targetJid);
                    count = metadata.participants.length;
                }
                catch (e) {
                    const members = await MemberRepository.getActiveMembers(groupId);
                    count = members.length;
                }
            }
            const message = replacePlaceholders(config.goodbye.message, {
                name: displayName || phone,
                group: group?.name || 'el grupo',
                count: count
            });
            await sock.sendMessage(targetJid, { text: message });
            logger.info(`Despedida enviada a ${displayName} en grupo ${groupId}`);
            return message;
        }
        catch (error) {
            logger.error(`Error al enviar despedida:`, error.message);
            return null;
        }
    }
}
export default WelcomeService;
