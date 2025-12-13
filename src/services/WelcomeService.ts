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
   * Helper: Obtiene el nombre del contacto con reintentos agresivos
   * Útil cuando un usuario recién se une y WhatsApp aún no ha propagado los datos
   */
  static async getContactNameWithRetries(sock, waId, retries = 10, delayMs = 1000) {
    const sleep = (ms) => new Promise(res => setTimeout(res, ms));
    
    let lastContact = null;

    for (let i = 0; i < retries; i++) {
      try {
        const contact = await sock.getContactById(waId);
        if (contact) {
          lastContact = contact;
          const name = contact.pushname || contact.name || contact.shortName;
          
          // Si tiene nombre, retornamos éxito
          if (name && name.trim().length > 0) {
            return { name: name.trim(), contact };
          }
          
          // Si es un LID y tiene link o número, retornamos el contacto aunque no tenga nombre
          // para que el caller pueda seguir el link (rehidratación cruzada)
          if (waId.includes('@lid') && (contact.linkedContactId || contact.number)) {
             return { name: null, contact }; 
          }
        }
      } catch (err) {
        // Ignorar errores temporales
      }
      await sleep(delayMs);
    }
    
    // Si agotamos reintentos, retornamos lo que tengamos
    if (lastContact) {
        return { name: null, contact: lastContact };
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
      let isLid = phone.includes('@lid');
      
      // Construir el ID inicial (puede cambiar si resolvemos LID)
      let waId = isLid ? phone : (phone.includes('@') ? phone : `${phone}@c.us`);

      // ============================================================
      // ESTRATEGIA DE REHIDRATACIÓN MEJORADA (Async & Aggressive)
      // ============================================================
      
      // 1. LID RESOLUTION (Critical Step)
      // Si es LID, intentamos resolver al JID real de teléfono primero
      // Esto es crucial porque el JID de teléfono suele tener el nombre más rápido
      if (isLid) {
          try {
             logger.debug(`🕵️ Resolviendo LID ${waId}...`);
             // Usamos retries para el LID también, por si acaso
             const lidResult = await this.getContactNameWithRetries(sock, waId, 3, 500);
             const lidContact = lidResult?.contact;
             
             if (lidContact) {
                 if (lidContact.linkedContactId) {
                     logger.info(`🔗 LID Resolution: ${waId} -> ${lidContact.linkedContactId._serialized || lidContact.linkedContactId}`);
                     waId = lidContact.linkedContactId._serialized || lidContact.linkedContactId;
                     isLid = false; // Ya no lo tratamos como LID
                 } else if (lidContact.number) {
                     // Fallback si tiene número pero no linkedContactId object
                     const possiblePhone = lidContact.number;
                     if (/^\d+$/.test(possiblePhone) && possiblePhone.length < 18) {
                        waId = `${possiblePhone}@c.us`;
                        isLid = false;
                        logger.info(`🔗 LID Resolution (via number): ${phone} -> ${waId}`);
                     }
                 }
             }
          } catch (e) { 
              logger.warn(`LID Resolution failed: ${e.message}`);
          }
      }

      // 2. NAME RESOLUTION (Retry Loop)
      // Ahora buscamos el nombre sobre el waId definitivo (sea el original o el resuelto)
      // Aumentamos retries a 10s (10 * 1000ms) como pidió el usuario
      let contact = contactObject;
      let realUserName = null;
      let resolvedPhoneJid = !isLid ? waId : null;
      
      // Si el contacto que vino por parámetro no tiene nombre, o si cambiamos de ID (LID->Phone), buscamos de nuevo
      const currentName = contact?.pushname || contact?.name;
      if (!currentName || !contact || (contact.id._serialized !== waId)) {
          logger.info(`🕵️ Buscando nombre para ${waId} (Wait up to 10s)...`);
          const found = await this.getContactNameWithRetries(sock, waId, 10, 1000);
          if (found) {
              contact = found.contact;
              realUserName = found.name;
              if (realUserName) logger.info(`✅ Nombre encontrado: "${realUserName}"`);
          }
      } else {
          realUserName = currentName;
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
