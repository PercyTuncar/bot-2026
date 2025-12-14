import MemberRepository from '../../repositories/MemberRepository.js';
import MemberService from '../../services/MemberService.js';
import ConfigService from '../../services/ConfigService.js';
import GroupRepository from '../../repositories/GroupRepository.js';
import { EMOJIS } from '../../config/constants.js';
import { getTargetUser } from '../../utils/parser.js';
import { normalizePhone, getCanonicalId } from '../../utils/phone.js';
import { formatDate, formatRelativeTime } from '../../utils/formatter.js';
import { config } from '../../config/environment.js';
import logger from '../../lib/logger.js';
import { reply } from '../../utils/reply.js';

/**
 * Función helper para validar que un nombre sea real (no solo números o LIDs)
 */
function isValidDisplayName(name: string | null | undefined): boolean {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  // Debe contener al menos una letra (evitar números/LIDs)
  return /[a-zA-ZáéíóúñÁÉÍÓÚÑàèìòùÀÈÌÒÙ]/.test(trimmed);
}

/**
 * Obtiene el nombre real de un usuario desde múltiples fuentes
 * Prioridad: Contact.pushname > Contact.name > member.displayName > phone
 */
async function getRealUserName(sock: any, targetJid: string, member: any, fallbackPhone: string): Promise<string> {
  let realName: string | null = null;
  
  // Fuente 1: Intentar obtener del Contact de WhatsApp (nombre más actualizado)
  if (sock) {
    try {
      const contact = await sock.getContactById(targetJid);
      if (contact) {
        // Prioridad: pushname (nombre configurado por el usuario) > name > shortName
        if (isValidDisplayName(contact.pushname)) {
          realName = contact.pushname.trim();
          logger.debug(`[INFO] Name from contact.pushname: "${realName}"`);
        } else if (isValidDisplayName(contact.name)) {
          realName = contact.name.trim();
          logger.debug(`[INFO] Name from contact.name: "${realName}"`);
        } else if (isValidDisplayName(contact.shortName)) {
          realName = contact.shortName.trim();
          logger.debug(`[INFO] Name from contact.shortName: "${realName}"`);
        } else if (isValidDisplayName(contact.notifyName)) {
          realName = contact.notifyName.trim();
          logger.debug(`[INFO] Name from contact.notifyName: "${realName}"`);
        }
      }
    } catch (e) {
      logger.debug(`[INFO] Could not get contact: ${e.message}`);
    }
  }
  
  // No usar Store; solo APIs oficiales

  // Fuente 3: Usar datos guardados en la base de datos
  if (!realName && member) {
    // Intentar varios campos del member
    const campos = [member.pushname, member.name, member.displayName, member.shortName];
    for (const campo of campos) {
      if (isValidDisplayName(campo)) {
        // Limpiar si tiene formato "nombre~numero"
        realName = campo.split('~')[0].trim();
        logger.debug(`[INFO] Name from member DB: "${realName}"`);
        break;
      }
    }
  }
  
  // Fallback: usar el número/ID
  return realName || fallbackPhone;
}

export default {
  name: 'info',
  description: 'Información de un usuario',
  category: 'general',
  permissions: 'user',
  scope: 'group',
  cooldown: 5,

  async execute({ sock, msg, args, groupId, userPhone, replyJid }) {
    try {
      await msg.react(EMOJIS.LOADING);
      // Obtener el chat para pasar a getTargetUser (necesario para resolver LIDs)
      let chat = null;
      try {
        chat = await msg.getChat();
      } catch (e) {
        logger.warn(`[INFO] Could not get chat: ${e.message}`);
      }
      
      // Intentar obtener el usuario objetivo usando getTargetUser
      const target = await getTargetUser(msg, chat);
      
      let targetPhone: string;
      let targetJid: string;
      let mentionJid: string;
      
      if (target) {
        // Si hay target (mencionado o quoted)
        targetPhone = target.isLid ? target.phone : (normalizePhone(target.phone) || target.phone);
        targetJid = target.jid;
        mentionJid = target.jid;
        logger.info(`[INFO] Target from mention/quote: phone=${targetPhone}, jid=${targetJid}, isLid=${target.isLid}`);
      } else if (args.length > 0) {
        // Si no hay mención pero hay argumentos, buscar por nombre
        const searchQuery = args.join(' ').replace('@', '');
        const foundMember = await MemberRepository.searchByName(groupId, searchQuery);
        if (foundMember) {
          targetPhone = foundMember.phone;
          targetJid = `${targetPhone}@c.us`;
          mentionJid = targetJid;
          logger.info(`[INFO] Target from search: phone=${targetPhone}`);
        } else {
          await reply(sock, msg, `${EMOJIS.WARNING} No encontré a nadie con el nombre "${searchQuery}"`);
          return;
        }
      } else {
        // Default: mostrar info propia
        targetPhone = normalizePhone(userPhone) || userPhone;
        targetJid = `${targetPhone}@c.us`;
        mentionJid = targetJid;
        logger.info(`[INFO] Showing own info: ${targetPhone}`);
      }

      // --------------------------------------------------------------------------
      // NORMALIZACIÓN CANÓNICA (SOLUCIÓN DEFINITIVA A DUPLICADOS)
      // --------------------------------------------------------------------------
      // Resolver cualquier ID (LID, JID, Phone) a su formato canónico (@c.us)
      // Esto previene que se cree un usuario "fantasma" si usamos un LID
      try {
        const canonicalJid = await getCanonicalId(sock, targetJid);
        
        // Actualizar targetPhone para usar el número del canonicalJid
        if (canonicalJid && canonicalJid.includes('@c.us')) {
            const canonicalPhone = canonicalJid.replace('@c.us', '');
            if (canonicalPhone !== targetPhone) {
                logger.info(`[INFO] Canonical ID resolved: ${targetPhone} -> ${canonicalPhone}`);
                targetPhone = canonicalPhone;
                // Mantenemos targetJid alineado con el canonical para búsquedas futuras
                targetJid = canonicalJid;
                // No cambiamos mentionJid para asegurar que la mención visual funcione con lo que whatsapp espera
            }
        }
      } catch (canonError) {
        logger.warn(`[INFO] Failed to resolve canonical ID: ${canonError.message}`);
      }

      logger.info(`${EMOJIS.INFO} Buscando info de usuario: phone=${targetPhone}, groupId=${groupId}`);

      let found = await MemberRepository.findByPhoneOrLid(groupId, targetPhone, targetPhone);
      let member = found ? found.data : null;
      let memberDocId = found?.docId || targetPhone;

      // Si no existe, intentar auto-registrar si está en el grupo
      // Esto soluciona el caso donde se consulta .info @usuario antes de que el usuario haya interactuado
      if (!member) {
        logger.info(`[INFO] Member not found, attempting auto-register for: ${targetPhone}`);
        
        try {
          // Usar MemberService.getOrCreateUnified para crear el miembro
          // Si el usuario es un LID, getOrCreateUnified manejará la extracción del teléfono real
          const userId = target ? (target.isLid ? target.jid : targetPhone) : targetPhone;
          logger.info(`[INFO] Auto-registering member with userId: ${userId}`);
          
          // Crear el miembro. Si es LID, se resolverá internamente a su número de teléfono
          // y se guardará con el número como docId.
          member = await MemberService.getOrCreateUnified(groupId, userId, sock, {
            authorName: target ? target.name : null
          });
          
          // Después de crear, el docId es member.phone (que será el número real)
          memberDocId = member?.phone || memberDocId;
          
          // Si obtuvimos un teléfono diferente al targetPhone (caso LID -> Phone), actualizamos targetPhone
          if (member?.phone && member.phone !== targetPhone) {
             logger.info(`[INFO] Resolved targetPhone from ${targetPhone} to ${member.phone}`);
             targetPhone = member.phone;
          }
          
          logger.info(`[INFO] Member auto-registered successfully: ${member?.phone}`);
        } catch (regError) {
          logger.error(`[INFO] Failed to auto-register member: ${regError.message}`);
        }
      }

      if (!member) {
        logger.warn(`${EMOJIS.WARNING} Usuario no encontrado en DB: ${targetPhone}`);
        await reply(sock, msg, `${EMOJIS.ERROR} Usuario no encontrado. Asegúrate de que el usuario esté en el grupo.`);
        return;
      }

      logger.info(`${EMOJIS.SUCCESS} Miembro encontrado: phone=${member.phone}, displayName=${member.displayName}`);

      // Obtener nombre real desde múltiples fuentes
      const displayName = await getRealUserName(sock, targetJid, member, targetPhone);
      
      // Si obtuvimos un mejor nombre, actualizar en la base de datos
      if (displayName && displayName !== targetPhone && displayName !== member.displayName) {
        try {
          await MemberRepository.update(groupId, memberDocId, { 
            displayName,
            name: displayName,
            pushname: displayName
          });
          logger.info(`[INFO] Updated displayName for ${memberDocId}: "${displayName}"`);
        } catch (e) {
          logger.debug(`[INFO] Could not update displayName: ${e.message}`);
        }
      }
      
      // Obtener configuración del grupo
      const groupConfig = await ConfigService.getGroupConfig(groupId);
      const maxWarnings = groupConfig?.limits?.maxWarnings || 3;

      // Construir respuesta según documentación
      // IMPORTANTE: Para menciones en WhatsApp, el texto debe usar el mismo ID que está en mentions
      // Si mentionJid es "198650894532802@lid", el texto debe ser "@198650894532802"
      // Extraemos el número/ID del JID (sin el sufijo @xxx)
      const mentionId = mentionJid.split('@')[0];
      
      let response = `${EMOJIS.INFO} *PERFIL DE USUARIO*\n\n`;
      response += `👤 *Nombre:* @${mentionId}\n`;
      response += `${EMOJIS.PHONE} *ID:* ${targetPhone}\n`;
      response += `${EMOJIS.USER} *Rol:* ${member.role || 'member'}\n\n`;
      
      // Sección de puntos
      response += `━━━━ *PUNTOS* ━━━━\n`;
      response += `${EMOJIS.TROPHY} *Puntos actuales:* ${member.points ?? 0} ${config.points.name}\n`;
      if ((member.lifetimePoints ?? 0) > 0 && member.lifetimePoints !== member.points) {
        response += `${EMOJIS.STAR} *Puntos totales:* ${member.lifetimePoints} ${config.points.name}\n`;
      }
      response += `${EMOJIS.MESSAGE} *Mensajes:* ${member.messageCount ?? 0}\n`;
      
      // Progreso hacia siguiente punto - usar configuración del grupo
      const pointsGroupConfig = await GroupRepository.getConfig(groupId);
      const group = await GroupRepository.getById(groupId);
      const messagesNeeded = pointsGroupConfig?.messagesPerPoint 
        || pointsGroupConfig?.points?.perMessages 
        || group?.config?.messagesPerPoint
        || group?.config?.points?.perMessages
        || config.points.perMessages || 10;
        
      // Calcular progreso basado en el total de mensajes para consistencia visual
      const messageCount = member.messageCount ?? 0;
      const messageProgress = messageCount % messagesNeeded;
      
      response += `${EMOJIS.LOADING} *Progreso:* ${messageProgress}/${messagesNeeded} mensajes para +1 punto\n`;
      
      // Sección de moderación
      response += `\n━━━━ *MODERACIÓN* ━━━━\n`;
      response += `${EMOJIS.WARNING} *Advertencias:* ${member.warnings ?? 0}/${maxWarnings}\n`;
      
      // Salidas del grupo según documentación
      const totalExits = member.totalExits ?? 0;
      response += `🚪 *Salidas del grupo:* ${totalExits}\n`;
      
      // Historial de eventos si hay
      const warnHistory = member.warnHistory || [];
      if (warnHistory.length > 0) {
        response += `📜 *Eventos registrados:* ${warnHistory.length}\n`;
      }
      
      // Sección de actividad
      response += `\n━━━━ *ACTIVIDAD* ━━━━\n`;
      if (member.joinedAt) {
        response += `${EMOJIS.CALENDAR} *Ingresó:* ${formatDate(member.joinedAt)}\n`;
      }
      if (member.lastMessageAt || member.lastActiveAt) {
        const lastActive = member.lastMessageAt || member.lastActiveAt;
        response += `${EMOJIS.CLOCK} *Último mensaje:* ${formatRelativeTime(lastActive)}\n`;
      }
      if (member.lastExitAt) {
        response += `🚪 *Última salida:* ${formatDate(member.lastExitAt)}\n`;
      }

      // Estado de membresía
      if (member.isMember === false) {
        response += `\n⚠️ *Este usuario ya no está en el grupo*`;
      }

      // Debug logging para menciones
      logger.info(`[INFO] Sending message with mention: mentionId=${mentionId}, mentionJid=${mentionJid}`);
      
      await reply(sock, msg, response, { mentions: [mentionJid] });
      await msg.react(EMOJIS.SUCCESS);
      logger.info(`${EMOJIS.SUCCESS} Info enviada correctamente para ${targetPhone}`);
    } catch (error) {
      logger.error(`${EMOJIS.ERROR} Error en comando info: ${error.message}`);
      await msg.react(EMOJIS.ERROR);
      await reply(sock, msg, `${EMOJIS.ERROR} Error al obtener información del usuario`);
    }
  }
};
