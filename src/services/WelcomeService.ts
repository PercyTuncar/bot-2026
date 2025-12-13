import GroupRepository from '../repositories/GroupRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import WelcomeImageService from './WelcomeImageService.js';
import { replacePlaceholders } from '../utils/formatter.js';
import { config as envConfig } from '../config/environment.js';
import { readFileSync } from 'fs';
import { normalizePhone, phoneToJid } from '../utils/phone.js';
import logger from '../lib/logger.js';
import pkg from 'whatsapp-web.js';
const { MessageMedia } = pkg;

export class WelcomeService {
  /**
   * Envía mensaje de bienvenida con mención real cliqueable
   * 
   * IMPORTANTE: Para que una mención sea cliqueable en WhatsApp:
   * 1. El cuerpo del mensaje debe contener @[id.user] (número o LID sin sufijo)
   * 2. El array mentions debe contener el objeto Contact completo
   * 3. WhatsApp renderiza @[numero] como @[nombre] automáticamente
   */
  static async sendWelcome(sock, groupId, phone, displayName, memberCount = null, contactObject = null) {
    try {
      logger.info(`👋 Processing welcome for ${phone} in ${groupId}`);
      const groupConfig = await GroupRepository.getConfig(groupId);

      if (!groupConfig?.welcome?.enabled) {
        logger.info(`ℹ️ Welcome disabled for group ${groupId}`);
        return null;
      }

      const group = await GroupRepository.getById(groupId);

      // Use provided count or fallback to DB count (which might be lower due to lazy registration)
      let count = memberCount;
      if (!count) {
        const members = await MemberRepository.getActiveMembers(groupId);
        count = members.length;
      }

      const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;

      // ============================================================
      // CRITICAL FIX: Construcción correcta de menciones para whatsapp-web.js
      // ============================================================
      // Para que la mención sea cliqueable y envíe notificación:
      // 1. El texto debe contener "@" + id.user (ej: @5491112345678 o @184980080701681)
      // 2. El array mentions debe contener IDs serializados (Strings) y NO objetos Contact
      // 3. WhatsApp automáticamente renderiza @numero como @NombreDelUsuario
      
      const isLid = phone.includes('@lid');
      
      // Obtener el objeto Contact si no se proporcionó
      // CRITICAL: Siempre intentar obtener el contacto si no tiene nombre
      // Esto asegura que tengamos el nombre más actualizado (re-hidratación)
      let contact = contactObject;
      if (!contact || (!contact.pushname && !contact.name)) {
        try {
          // Intentar obtener contacto fresco
          const freshContact = await sock.getContactById(phone);
          if (freshContact) {
             contact = freshContact;
             logger.debug(`Contact retrieved/refreshed for ${phone}: pushname=${contact?.pushname}, name=${contact?.name}`);
          }
        } catch (err) {
          logger.debug(`Could not get contact for ${phone}: ${err.message}`);
        }
      }
      
      // ============================================================
      // Extraer el nombre REAL del usuario desde el Contact de WhatsApp
      // Prioridad: pushname > name > shortName > displayName proporcionado
      // pushname es el nombre que el usuario configuró en su WhatsApp
      // ============================================================
      
      // Función helper para validar que un nombre sea real (no números/LID)
      const isValidDisplayName = (name: string | null | undefined): boolean => {
        if (!name || typeof name !== 'string') return false;
        const trimmed = name.trim();
        if (!trimmed) return false;
        // Debe contener al menos una letra (evitar números/LIDs)
        return /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(trimmed);
      };
      
      // Intentar obtener nombre del Contact
      let realUserName: string | null = null;
      
      // Fuente 1: Contact object (pushname es el nombre configurado por el usuario)
      if (contact) {
        if (isValidDisplayName(contact.pushname)) {
          realUserName = contact.pushname.trim();
          logger.debug(`✅ Name from contact.pushname: "${realUserName}"`);
        } else if (isValidDisplayName(contact.name)) {
          realUserName = contact.name.trim();
          logger.debug(`✅ Name from contact.name: "${realUserName}"`);
        } else if (isValidDisplayName(contact.shortName)) {
          realUserName = contact.shortName.trim();
          logger.debug(`✅ Name from contact.shortName: "${realUserName}"`);
        }
      }
      
      // Fuente 2: displayName proporcionado (ya validado en event-handler)
      if (!realUserName && isValidDisplayName(displayName)) {
        realUserName = displayName.trim();
        logger.debug(`✅ Name from provided displayName: "${realUserName}"`);
      }
      
      // Si no encontramos nombre válido, dejar null (no mostrar nombre en imagen)
      const safeDisplayName = realUserName || null;
      
      logger.info(`👤 User name resolution: contact.pushname="${contact?.pushname}", contact.name="${contact?.name}", displayName="${displayName}", final="${safeDisplayName}"`);
      
      // Extraer el ID del usuario para el texto del mensaje
      // Para LIDs: extraer la parte numérica antes del :
      // Para números: usar el número sin sufijo
      let mentionIdForText;
      if (isLid) {
        // LID format: 184980080701681@lid - usar tal cual sin @lid
        mentionIdForText = phone.replace('@lid', '');
      } else {
        // Phone format: 5491112345678@c.us o @s.whatsapp.net
        mentionIdForText = phone.replace('@c.us', '').replace('@s.whatsapp.net', '');
      }
      
      // El texto de mención debe ser @[id] para que WhatsApp lo vincule
      // WhatsApp renderizará esto como @NombreDelUsuario automáticamente
      const mentionText = `@${mentionIdForText}`;
      
      // Si tenemos un nombre real (pushname) y no es solo el número, 
      // usaremos el nombre directamente para una mejor experiencia visual si la mención falla
      // PERO mantenemos mentionText para la variable {user} que se usa para etiquetar
      const displayNameForMsg = realUserName || mentionText;
      
      logger.info(`📝 Mention construction: phone=${phone}, idForText=${mentionIdForText}, hasContact=${!!contact}, displayNameForMsg=${displayNameForMsg}`);

      let message = replacePlaceholders(groupConfig.welcome.message, {
        user: mentionText, // Mención cliqueable: @ID (WhatsApp lo transforma a @Nombre)
        name: displayNameForMsg, // Nombre real legible (texto plano si no hay mención)
        group: group?.name || 'el grupo',
        count: count
      });

      // Ensure message is not empty
      if (!message || message.trim() === '') {
        message = `¡Bienvenido ${mentionText} al grupo!`;
      }

      // Intentar generar y enviar imagen de bienvenida
      let imageBuffer: Buffer | null = null;
      logger.info(`🖼️ Welcome image check: envConfig.welcomeImages=${envConfig.features?.welcomeImages}, groupConfig.welcomeImages=${groupConfig.features?.welcomeImages}, cloudinaryUrl=${envConfig.cloudinary?.welcomeBgUrl ? 'SET' : 'NOT SET'}`);
      
      if (envConfig.features?.welcomeImages && groupConfig.features?.welcomeImages !== false) {
        try {
          // Verificar que tengamos la configuración necesaria
          if (!envConfig.cloudinary?.welcomeBgUrl) {
            logger.warn('Welcome images enabled but no background URL configured in WELCOME_BG_URL');
          } else {
            // Obtener URL del avatar del usuario
            const profilePicUrl = await sock.getProfilePicUrl(phone).catch((err) => {
              logger.debug(`No profile pic for ${phone}: ${err.message}`);
              return null;
            });

            // El servicio ahora retorna un Buffer directamente
            imageBuffer = await WelcomeImageService.generateWelcomeImage(
              profilePicUrl || '',
              safeDisplayName,
              group?.name || 'el grupo'
            );

            if (!imageBuffer) {
              logger.warn('WelcomeImageService returned null - check logs for generation errors');
            }
          }
        } catch (error) {
          logger.error(`Error generating welcome image:`, error);
        }
      } else {
        logger.debug('Welcome images disabled or not configured');
      }

      // ============================================================
      // CRITICAL: El array mentions debe contener IDs serializados
      // La librería whatsapp-web.js ha deprecado pasar objetos Contact
      // ============================================================
      // FIX FINAL: Asegurarse de que el array contenga strings serializados correctamente
      // Si tenemos contacto, usamos id._serialized. Si no, construimos el ID manualmente.
      const mentionId = contact && contact.id && contact.id._serialized 
          ? contact.id._serialized 
          : (isLid ? phone : `${phone.replace('@c.us', '')}@c.us`);
          
      const mentions = [mentionId];
      
      logger.info(`📤 Sending welcome: message="${message.substring(0, 50)}...", mentions=${JSON.stringify(mentions)}`);

      if (imageBuffer) {
        try {
          // Crear MessageMedia desde Buffer (base64)
          const base64Image = imageBuffer.toString('base64');
          const media = new MessageMedia('image/png', base64Image, 'welcome.png');
          
          await sock.sendMessage(targetJid, media, {
            caption: message,
            mentions: mentions
          });
          logger.info(`✅ Imagen de bienvenida enviada`);
        } catch (error) {
          logger.warn(`Error al enviar imagen, enviando solo texto:`, error);
          await sock.sendMessage(targetJid, message, { mentions: mentions });
        }
      } else {
        await sock.sendMessage(targetJid, message, { mentions: mentions });
      }

      logger.info(`✅ Bienvenida enviada a ${safeDisplayName} (${phone}) en grupo ${groupId}`);
      return message;
    } catch (error) {
      logger.error(`Error al enviar bienvenida:`, error);
      return null;
    }
  }

  /**
   * Envía mensaje de despedida
   */
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
    } catch (error) {
      logger.error(`Error al enviar despedida:`, error);
      return null;
    }
  }
}

export default WelcomeService;
