import GroupRepository from '../repositories/GroupRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import WelcomeImageService, { welcomeImageService } from './WelcomeImageService.js';
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
   * NUEVO: Extrae el nombre que WhatsApp mostrará para una mención
   * WhatsApp Web tiene esta información en su Store interno, incluso en grupos grandes
   * porque ya resolvió el nombre para poder mostrar la mención correctamente.
   * 
   * @param sock - Cliente de WhatsApp
   * @param jid - JID del usuario (puede ser LID o phone@c.us)
   * @returns El nombre que WhatsApp mostrará, o null si no se puede obtener
   */
  static async getNameForMention(sock: any, jid: string): Promise<string | null> {
    if (!sock?.pupPage) return null;

    try {
      const result = await sock.pupPage.evaluate(async (participantJid: string) => {
        try {
          // @ts-ignore
          const store = window.Store;
          if (!store) return null;

          // Helper para validar nombres
          const isValid = (n: any): boolean => {
            if (!n || typeof n !== 'string') return false;
            const t = n.trim();
            return t.length > 0 && t !== 'undefined' && t.toLowerCase() !== 'null';
          };

          // 1. Buscar en Contact Store - Esta es la fuente principal
          // CRÍTICO: pushname = nombre del PERFIL de WhatsApp
          // contact.name = nombre que TÚ guardaste - NO USAR
          if (store.Contact) {
            const contact = store.Contact.get(participantJid);
            if (contact) {
              // ORDEN CORRECTO: pushname (perfil) > verifiedName > notifyName
              // NUNCA usar contact.name (nombre guardado en contactos)
              if (isValid(contact.pushname)) return { name: contact.pushname, source: 'Contact.pushname' };
              if (isValid(contact.verifiedName)) return { name: contact.verifiedName, source: 'Contact.verifiedName' };
              if (isValid(contact.notifyName)) return { name: contact.notifyName, source: 'Contact.notifyName' };
            }
          }

          // 2. Intentar con el Chat (a veces tiene info adicional)
          if (store.Chat) {
            const chat = store.Chat.get(participantJid);
            if (chat) {
              // Primero buscar en contact.pushname (perfil), NO en chat.name o contact.name
              if (chat.contact) {
                if (isValid(chat.contact.pushname)) return { name: chat.contact.pushname, source: 'Chat.contact.pushname' };
                if (isValid(chat.contact.verifiedName)) return { name: chat.contact.verifiedName, source: 'Chat.contact.verifiedName' };
              }
              // chat.name puede ser el nombre del chat (no del usuario), usarlo como último recurso
              if (isValid(chat.name)) return { name: chat.name, source: 'Chat.name' };
            }
          }

          // 3. Buscar en todos los GroupMetadata (el usuario puede estar en otro grupo)
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
                      if (isValid(p.pushname)) return { name: p.pushname, source: 'GroupMeta.pushname' };
                      if (isValid(p.notify)) return { name: p.notify, source: 'GroupMeta.notify' };
                      if (isValid(p.name)) return { name: p.name, source: 'GroupMeta.name' };
                    }
                  }
                }
              }
            }
          }

          // 4. Buscar en mensajes recientes (el nombre viene en los mensajes)
          if (store.Msg && store.Msg._index) {
            for (const [, msg] of store.Msg._index) {
              const senderId = msg?.senderObj?.id?._serialized || msg?.sender?._serialized || msg?.from;
              if (senderId === participantJid) {
                if (isValid(msg.notifyName)) return { name: msg.notifyName, source: 'Msg.notifyName' };
                if (msg.senderObj && isValid(msg.senderObj.pushname)) {
                  return { name: msg.senderObj.pushname, source: 'Msg.senderObj.pushname' };
                }
              }
            }
          }

          return null;
        } catch (e) {
          return null;
        }
      }, jid);

      if (result && result.name) {
        logger.info(`✅ [getNameForMention] Nombre encontrado (${result.source}): "${result.name}"`);
        return result.name;
      }

      return null;
    } catch (err: any) {
      logger.debug(`[getNameForMention] Error: ${err.message}`);
      return null;
    }
  }

  /**
   * Envía mensaje de bienvenida con mención real cliqueable
   * 
   * FLUJO CORREGIDO (Dic 2025):
   * 1. Preparar la mención (@numero) - WhatsApp la renderiza como @NombreReal
   * 2. Obtener el nombre que WhatsApp mostrará (desde el Store interno)
   * 3. Generar la imagen con ese nombre
   * 4. Enviar el mensaje con imagen
   * 
   * Esto garantiza que el nombre en la imagen = nombre en la mención
   */
  static async sendWelcome(sock, groupId, phone, displayName, memberCount = null, contactObject = null) {
    const sleep = (ms) => new Promise(res => setTimeout(res, ms));

    try {
      logger.info(`👋 Processing welcome for ${phone} in ${groupId}`);

      // ============================================================
      // DELAY ESTRATÉGICO: Dar tiempo a WhatsApp para propagar datos
      // En grupos grandes, WhatsApp necesita unos segundos para 
      // sincronizar la información del nuevo participante
      // ============================================================
      await sleep(2000);

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
      // PASO 1: Determinar el JID para la mención
      // ============================================================
      let contact = contactObject;
      let resolvedPhoneJid = null;

      // Si es LID, intentar obtener el Phone JID
      if (isLid) {
        try {
          const found = await this.getContactNameWithRetries(sock, waId, 3, 300);
          if (found && found.contact) {
            contact = found.contact;
            if (contact.linkedContactId) {
              resolvedPhoneJid = contact.linkedContactId;
            } else if (contact.number && /^\d+$/.test(contact.number)) {
              resolvedPhoneJid = `${contact.number}@c.us`;
            }
          }
        } catch (e) { }
      }

      // El JID final para la mención (preferir phone sobre LID)
      const finalMentionJid = resolvedPhoneJid || waId;

      // Extraer el número limpio para el texto de la mención
      let cleanNumberForText;
      if (finalMentionJid.includes('@lid')) {
        cleanNumberForText = finalMentionJid.replace('@lid', '').split(':')[0];
      } else {
        cleanNumberForText = finalMentionJid.replace('@c.us', '').replace('@s.whatsapp.net', '');
      }

      // Texto de la mención (ej: @51999888777)
      const userMentionText = `@${cleanNumberForText}`;

      // ============================================================
      // PASO 2: Obtener el NOMBRE que WhatsApp mostrará en la mención
      // Esta es la clave: WhatsApp ya tiene el nombre en su Store
      // y lo usará automáticamente cuando rendericemos la mención
      // ============================================================

      let nameForDisplay: string | null = null;

      // 2.1 Intentar obtener el nombre del Store de WhatsApp usando múltiples JIDs
      // Este es el nombre que WhatsApp mostrará cuando renderice @numero
      const jidsToTry = [finalMentionJid];
      if (finalMentionJid !== waId) jidsToTry.push(waId);

      // Si tenemos un número de teléfono, también intentar con ese JID
      if (cleanNumberForText && /^\d+$/.test(cleanNumberForText)) {
        const phoneJid = `${cleanNumberForText}@c.us`;
        if (!jidsToTry.includes(phoneJid)) jidsToTry.push(phoneJid);
      }

      // CRÍTICO: Si displayName es un número de teléfono puro (fue resuelto previamente),
      // usarlo también para buscar el nombre del contacto
      // Esto es importante porque displayName puede contener el teléfono real resuelto de un LID
      if (displayName && /^\d{8,}$/.test(displayName)) {
        const resolvedPhoneJidFromName = `${displayName}@c.us`;
        if (!jidsToTry.includes(resolvedPhoneJidFromName)) {
          jidsToTry.push(resolvedPhoneJidFromName);
          // También actualizar cleanNumberForText al número real
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

      // 2.2 Intentar obtener desde los participantes del grupo directamente vía Puppeteer
      if (!nameForDisplay && sock?.pupPage) {
        try {
          const groupJid = targetJid;
          const participantJid = waId;
          const result = await sock.pupPage.evaluate(async (gJid: string, pJid: string) => {
            try {
              // @ts-ignore
              const store = window.Store;
              if (!store?.GroupMetadata) return null;

              const groupMeta = store.GroupMetadata.get(gJid);
              if (!groupMeta?.participants) return null;

              const participants = Array.isArray(groupMeta.participants)
                ? groupMeta.participants
                : (groupMeta.participants.getModelsArray ? groupMeta.participants.getModelsArray() : []);

              if (Array.isArray(participants)) {
                for (const p of participants) {
                  const pId = p.id?._serialized || p.id;
                  if (pId === pJid || pId?.includes(pJid?.split('@')[0])) {
                    if (p.pushname) return p.pushname;
                    if (p.notify) return p.notify;
                    if (p.name) return p.name;
                  }
                }
              }
              return null;
            } catch (e) {
              return null;
            }
          }, groupJid, participantJid);

          if (result) {
            nameForDisplay = result;
            logger.info(`✅ [Welcome] Nombre obtenido de GroupMetadata: "${result}"`);
          }
        } catch (e) {
          // Ignorar errores
        }
      }

      // 2.3 Fallback al displayName proporcionado (solo si NO es "Usuario" o "Unknown")
      if (!nameForDisplay && displayName && displayName !== 'Usuario' && displayName !== 'Unknown' && displayName !== 'undefined') {
        nameForDisplay = displayName;
      }

      // 2.4 Si tenemos contacto, usar su pushname (solo si es válido)
      if (!nameForDisplay && contact) {
        const contactName = contact.pushname || contact.name || contact.shortName;
        if (contactName && contactName !== 'undefined' && contactName !== 'Usuario') {
          nameForDisplay = contactName;
        }
      }

      // 2.5 ESTRATEGIA CLAVE: Usar el número de teléfono resuelto para obtener el contacto
      // Si tenemos cleanNumberForText (el número real), podemos usar getContactById
      // Esta es la estrategia más confiable porque WhatsApp tiene mejor data para phone@c.us que para LIDs
      if (!nameForDisplay && sock && cleanNumberForText && /^\d+$/.test(cleanNumberForText)) {
        try {
          const phoneJid = `${cleanNumberForText}@c.us`;
          logger.info(`🔍 [Welcome] Intentando getContactById con número resuelto: ${phoneJid}`);

          const resolvedContact = await sock.getContactById(phoneJid);
          if (resolvedContact) {
            // Priorizar pushname (nombre de perfil), luego name, luego shortName
            const contactName = resolvedContact.pushname || resolvedContact.name || resolvedContact.shortName;
            if (contactName && contactName !== 'undefined' && contactName !== 'null' && contactName !== 'Usuario') {
              nameForDisplay = contactName;
              logger.info(`✅ [Welcome] Nombre obtenido de getContactById(${phoneJid}): "${nameForDisplay}"`);
            }
          }
        } catch (e: any) {
          logger.debug(`[Welcome] getContactById con número resuelto falló: ${e.message}`);
        }
      }

      // 2.6 CRÍTICO: Siempre usar el número de teléfono como fallback final
      // NUNCA usar "Usuario" o "Unknown" - es preferible mostrar el número
      if (!nameForDisplay || nameForDisplay === 'Usuario' || nameForDisplay === 'undefined' || nameForDisplay === 'Unknown') {
        // Usar el número limpio (sin @lid ni @c.us)
        nameForDisplay = cleanNumberForText;
        logger.info(`📱 [Welcome] Usando número de teléfono como nombre: "${nameForDisplay}"`);
      }

      logger.info(`📝 Datos finales: JID=${finalMentionJid}, mention=${userMentionText}, nameForDisplay="${nameForDisplay}"`);

      // ============================================================
      // PASO 3: Generar el mensaje con placeholders
      // ============================================================

      let message = replacePlaceholders(groupConfig.welcome.message, {
        user: userMentionText,      // @519... → WhatsApp lo renderiza como @NombreReal
        name: nameForDisplay,        // Nombre en texto plano
        group: group?.name || 'el grupo',
        count: count
      });

      if (!message || message.trim() === '') {
        message = `¡Bienvenido ${userMentionText} al grupo!`;
      }

      const mentions = [finalMentionJid];

      // ============================================================
      // PASO 4: Generar la imagen CON EL NOMBRE CORRECTO
      // Usamos nameForDisplay que es el mismo nombre que WhatsApp mostrará
      // ============================================================

      let imageBuffer: Buffer | null = null;
      if (envConfig.features?.welcomeImages && groupConfig.features?.welcomeImages !== false) {
        try {
          if (envConfig.cloudinary?.welcomeBgUrl) {
            // DELEGAMOS la lógica de obtención de imagen al servicio especializado
            // Usamos finalMentionJid (el ID de teléfono resuelto) para mejor compatibilidad con getProfilePicUrl
            // Si no pudimos resolver a teléfono, waId será el fallback
            imageBuffer = await welcomeImageService.createWelcomeImage(
              finalMentionJid, // ID preferido para buscar foto (phone@c.us > LID)
              nameForDisplay,  // Nombre para mostrar y semilla de avatar
              sock             // Cliente para fetching avanzado
            );
          }
        } catch (error) {
          logger.error(`Error generating welcome image:`, error);
        }
      }

      // ============================================================
      // PASO 5: Enviar el mensaje (imagen + caption o solo texto)
      // ============================================================

      if (imageBuffer) {
        try {
          const base64Image = imageBuffer.toString('base64');
          const media = new MessageMedia('image/png', base64Image, 'welcome.png');

          await sock.sendMessage(targetJid, media, {
            caption: message,
            mentions: mentions
          });
          logger.info(`✅ Imagen de bienvenida enviada a "${nameForDisplay}"`);
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
