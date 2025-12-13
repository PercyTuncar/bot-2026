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
   * Helper: Obtiene el nombre del contacto con reintentos
   * Útil cuando un usuario recién se une y WhatsApp aún no ha propagado los datos
   */
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
      } catch (err) {
        // Ignorar errores temporales
      }
      await sleep(delayMs);
    }
    return null;
  }

  /**
   * Envía mensaje de bienvenida con mención real cliqueable
   * 
   * IMPORTANTE: Para que una mención sea cliqueable en WhatsApp:
   * 1. El cuerpo del mensaje debe contener @[id.user] (número o LID sin sufijo)
   * 2. El array mentions debe contener strings (IDs) - NO objetos Contact
   * 3. WhatsApp renderiza @[numero] como @[nombre] automáticamente si tiene los datos
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

      // Use provided count or fallback to DB count
      let count = memberCount;
      if (!count) {
        const members = await MemberRepository.getActiveMembers(groupId);
        count = members.length;
      }

      const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
      const isLid = phone.includes('@lid');
      
      // Construir el ID completo para búsquedas
      const waId = isLid ? phone : (phone.includes('@') ? phone : `${phone}@c.us`);

      // ============================================================
      // ESTRATEGIA DE REHIDRATACIÓN: Intentar obtener el nombre REAL
      // ============================================================
      // Cuando alguien entra, a veces getContactById no trae el pushname inmediatamente.
      // Hacemos un pequeño esfuerzo de reintentos antes de enviar la bienvenida.
      
      let contact = contactObject;
      let realUserName = null;
      let resolvedPhoneJid = null; // Para almacenar el JID de teléfono si es un LID
      
      // Si no tenemos contacto o nombre, intentamos buscarlo con retries
      if (!contact || (!contact.pushname && !contact.name) || isLid) {
        logger.debug(`🕵️ Buscando nombre para ${waId} con reintentos...`);
        
        // Si es LID, intentamos obtener el contacto para ver si tiene el número real o linkedContactId
        if (isLid) {
             const found = await this.getContactNameWithRetries(sock, waId);
             if (found && found.contact) {
                 contact = found.contact;
                 realUserName = found.name;
                 
                 // Intentar obtener el Phone JID asociado si es un LID
                 // A veces el contacto de un LID tiene la propiedad linkedContactId o number
                 if (contact.linkedContactId) {
                     logger.info(`🔗 Found linked contact for LID: ${contact.linkedContactId}`);
                     // Intentar obtener el contacto del teléfono vinculado para asegurar el nombre
                     const linkedContact = await sock.getContactById(contact.linkedContactId);
                     if (linkedContact) {
                         contact = linkedContact; // Usar el contacto del teléfono
                         resolvedPhoneJid = contact.id._serialized;
                         realUserName = contact.pushname || contact.name || realUserName; // Actualizar nombre si es mejor
                     }
                 } else if (contact.number) {
                     // Si el contacto del LID tiene un número de teléfono válido
                     const possiblePhone = contact.number; // e.g., 549...
                     // Validar si parece un número de teléfono
                     if (/^\d+$/.test(possiblePhone) && possiblePhone.length < 18) {
                        resolvedPhoneJid = `${possiblePhone}@c.us`;
                     }
                 }
             }
        } else {
            // No es LID, flujo normal
            const found = await this.getContactNameWithRetries(sock, waId);
            if (found) {
              contact = found.contact;
              realUserName = found.name;
              logger.info(`✅ Nombre encontrado tras reintentos: "${realUserName}"`);
            }
        }
      } else {
        // Ya teníamos contacto válido
        realUserName = contact.pushname || contact.name || contact.shortName;
      }

      // Fallback al displayName proporcionado por el evento si no encontramos nada mejor
      if (!realUserName && displayName) {
        realUserName = displayName;
      }
      
      const safeDisplayName = realUserName || 'Usuario';
      
      // ============================================================
      // PREPARAR VARIABLES PARA EL MENSAJE
      // ============================================================
      
      // 1. Determine the JID to use for the mention (Prefer Phone JID over LID)
      // Si logramos resolver un Phone JID desde el LID, lo usamos.
      // Si no, usamos el waId original (que puede ser Phone o LID).
      const finalMentionJid = resolvedPhoneJid || (!isLid ? waId : waId); 
      
      // 2. Extract number for text display (clean number)
      let cleanNumberForText;
      if (finalMentionJid.includes('@lid')) {
          cleanNumberForText = finalMentionJid.replace('@lid', '').split(':')[0];
      } else {
          cleanNumberForText = finalMentionJid.replace('@c.us', '').replace('@s.whatsapp.net', '');
      }

      // ============================================================
      // FIX VISUAL: Priorizar Nombre sobre Número en la variable {user}
      // ============================================================
      // El usuario reporta que ver "@123456" es indeseable.
      // Aunque técnicamente "@numero" es lo más robusto para crear el enlace,
      // si tenemos el nombre real (pushname), intentaremos usarlo: "@Pepito".
      // Enviamos el ID en 'mentions' y esperamos que WhatsApp haga la magia de vincularlos
      // o al menos muestre el nombre legible que es la prioridad del usuario.
      
      const userMentionText = realUserName ? `@${realUserName}` : `@${cleanNumberForText}`;
      
      // 4. displayNameForMsg: El nombre bonito para leer (texto plano)
      const displayNameForMsg = realUserName || cleanNumberForText;

      logger.info(`📝 Mention data: finalMentionJid=${finalMentionJid}, userMentionText=${userMentionText}, displayNameForMsg=${displayNameForMsg}`);

      // ============================================================
      // GENERAR MENSAJE
      // ============================================================

      let message = replacePlaceholders(groupConfig.welcome.message, {
        user: userMentionText, // @519... (Mención real cliqueable, preferiblemente Phone JID)
        name: displayNameForMsg, // Nombre real (texto plano, no cliqueable)
        group: group?.name || 'el grupo',
        count: count
      });

      if (!message || message.trim() === '') {
        message = `¡Bienvenido ${userMentionText} al grupo!`;
      }

      // Use the resolved JID for the mentions array
      const mentions = [finalMentionJid];

      // ============================================================
      // ENVIAR (IMAGEN O TEXTO)
      // ============================================================

      let imageBuffer: Buffer | null = null;
      if (envConfig.features?.welcomeImages && groupConfig.features?.welcomeImages !== false) {
        try {
          if (envConfig.cloudinary?.welcomeBgUrl) {
            const profilePicUrl = await sock.getProfilePicUrl(waId).catch(() => null);
            imageBuffer = await WelcomeImageService.generateWelcomeImage(
              profilePicUrl || '',
              safeDisplayName, // Usar nombre real en la imagen
              group?.name || 'el grupo'
            );
          }
        } catch (error) {
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
          logger.info(`✅ Imagen de bienvenida enviada a ${safeDisplayName}`);
        } catch (error) {
          logger.warn(`Error al enviar imagen, enviando solo texto:`, error);
          await sock.sendMessage(targetJid, message, { mentions: mentions });
        }
      } else {
        await sock.sendMessage(targetJid, message, { mentions: mentions });
      }

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
