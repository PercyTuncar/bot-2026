import MemberRepository from '../../repositories/MemberRepository.js';
import WarningService from '../../services/WarningService.js';
import { getTargetUser } from '../../utils/parser.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import { getNow } from '../../utils/time.js';
import logger from '../../lib/logger.js';

export default {
  name: 'kick',
  aliases: ['expulsar', 'ban'],
  description: 'Expulsar a un usuario del grupo (menciona o responde a su mensaje)',
  usage: '.kick @usuario [motivo] o responder a un mensaje con .kick [motivo]',
  example: '.kick @51999999999 Spam repetido',
  category: 'moderation',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 5,

  async execute({ sock, msg, args, groupId, groupJid, userPhone, replyJid }) {
    // Obtener el chat para pasar a getTargetUser (necesario para resolver LIDs)
    let chat = null;
    try {
      chat = await msg.getChat();
    } catch (e) {
      logger.warn(`[KICK] Could not get chat: ${e.message}`);
    }

    // Variables para la información del target y el mensaje citado
    let quotedMessageContent = null;
    let quotedMessageId = null;
    let quotedMsg = null;

    // Usar getTargetUser que soporta quoted message, menciones y LIDs
    const target = await getTargetUser(msg, chat);

    if (!target) {
      await sock.sendMessage(replyJid, formatError(
        '*Uso del comando:*\n\n' +
        '1️⃣ Responde a un mensaje con _.kick [motivo]_\n' +
        '2️⃣ Usa _.kick @usuario [motivo]_\n\n' +
        '_El motivo es opcional_'
      ));
      return;
    }

    // Si es un LID, usar el LID directamente como identificador
    const targetPhone = target.isLid ? target.phone : (normalizePhone(target.phone) || target.phone);
    const normalizedAdmin = normalizePhone(userPhone) || userPhone;
    const targetName = target.name || targetPhone;
    const mentionJid = target.jid;

    logger.info(`[KICK] Target: phone=${targetPhone}, name=${targetName}, method=${target.method}, isLid=${target.isLid}, jid=${mentionJid}`);

    // No comparar si uno es LID y otro no (evitar auto-kick)
    if (!target.isLid && targetPhone === normalizedAdmin) {
      await sock.sendMessage(replyJid, formatError('No puedes expulsarte a ti mismo'));
      return;
    }

    // Verificar si el target es admin (no se puede expulsar admins)
    if (chat && chat.isGroup) {
      try {
        const participant = chat.participants?.find(p => 
          p.id._serialized === mentionJid || 
          p.id._serialized === `${targetPhone}@c.us` ||
          p.id._serialized === `${targetPhone}@s.whatsapp.net` ||
          p.id._serialized === `${targetPhone}@lid`
        );
        if (participant?.isAdmin) {
          await sock.sendMessage(replyJid, formatError('🛡️ No puedes expulsar a un administrador'));
          return;
        }
      } catch (e) {
        logger.warn(`[KICK] Could not check admin status: ${e.message}`);
      }
    }

    // Si fue por respuesta a mensaje, capturar el contenido como evidencia
    if (msg.hasQuotedMsg && target.method === 'quoted') {
      try {
        quotedMsg = await msg.getQuotedMessage();
        if (quotedMsg) {
          quotedMessageId = quotedMsg.id?._serialized || quotedMsg.id?.id;
          // Capturar el contenido del mensaje como evidencia
          quotedMessageContent = quotedMsg.body || quotedMsg.caption || '[Mensaje sin texto - posible media]';
          
          // Si es media, agregar descripción del tipo
          if (quotedMsg.hasMedia) {
            const mediaType = quotedMsg.type || 'media';
            quotedMessageContent = `[${mediaType.toUpperCase()}] ${quotedMessageContent || ''}`.trim();
          }
          
          logger.info(`[KICK] Captured quoted message content: "${quotedMessageContent.substring(0, 100)}..."`);
        }
      } catch (e) {
        logger.warn(`[KICK] Could not capture quoted message: ${e.message}`);
      }
    }

    // Determinar el motivo
    // Si viene por mención: .kick @usuario motivo -> args[1] en adelante es el motivo
    // Si viene por respuesta: .kick motivo -> args[0] en adelante es el motivo adicional
    let reason = '';
    if (target.method === 'quoted') {
      // El motivo viene en args (todo es motivo adicional)
      reason = args.join(' ').trim();
    } else {
      // El primer arg es la mención, el resto es el motivo
      reason = args.slice(1).join(' ').trim();
    }

    // Si hay contenido del mensaje citado, usarlo como evidencia principal
    if (quotedMessageContent) {
      if (reason) {
        reason = `${reason}\n\n📝 *Evidencia (mensaje eliminado):*\n"${quotedMessageContent}"`;
      } else {
        reason = `📝 *Mensaje que causó la expulsión:*\n"${quotedMessageContent}"`;
      }
    }

    // Si aún no hay motivo, usar uno por defecto
    if (!reason) {
      reason = 'Expulsado por un administrador';
    }

    const adminName = msg.pushName || normalizedAdmin;

    try {
      // 1. Buscar el documento del miembro para obtener el docId correcto
      const found = await MemberRepository.findByPhoneOrLid(groupId, targetPhone, targetPhone);
      const docId = found?.docId || targetPhone;
      
      // 2. Actualizar estado del miembro en la BD usando el docId correcto
      await MemberRepository.update(groupId, docId, {
        isMember: false,
        kickedAt: getNow(),
        lastKickReason: reason,
        lastKickBy: normalizedAdmin,
        lastKickByName: adminName
      });

      // 3. Registrar el kick en el historial usando WarningService
      await WarningService.logKick(groupId, targetPhone, reason);

      // 3. Intentar eliminar el mensaje citado (si existe)
      if (quotedMsg && quotedMessageId) {
        try {
          // En whatsapp-web.js, podemos intentar eliminar para todos si somos admin
          const deleted = await quotedMsg.delete(true); // true = para todos
          if (deleted) {
            logger.info(`[KICK] Quoted message deleted successfully: ${quotedMessageId}`);
          }
        } catch (deleteError) {
          logger.warn(`[KICK] Could not delete quoted message: ${deleteError.message}`);
          // No es crítico si no se puede borrar, continuamos con el kick
        }
      }

      // 4. Ejecutar la expulsión del grupo
      const targetJid = groupJid || (groupId.includes('@') ? groupId : `${groupId}@g.us`);
      const chatForKick = await sock.getChatById(targetJid);
      
      // Construir el JID correcto para la expulsión
      const participantToKick = target.isLid ? mentionJid : `${targetPhone}@s.whatsapp.net`;
      
      await chatForKick.removeParticipants([participantToKick]);

      // 5. Enviar mensaje de confirmación
      let confirmMessage = `🚫 *USUARIO EXPULSADO*\n\n`;
      confirmMessage += `👤 *Usuario:* @${target.phone} (${targetName})\n`;
      confirmMessage += `👮 *Por:* ${adminName}\n`;
      confirmMessage += `📅 *Fecha:* ${new Date().toLocaleString('es-PE')}\n\n`;
      confirmMessage += `📋 *Motivo:*\n${reason}`;
      
      if (quotedMessageContent) {
        confirmMessage += `\n\n🗑️ _El mensaje de evidencia ha sido eliminado_`;
      }

      await sock.sendMessage(targetJid, confirmMessage, { mentions: [participantToKick] });

      logger.info(`[KICK] User ${targetPhone} (${targetName}) kicked from group ${groupId} by ${normalizedAdmin}`);

    } catch (error) {
      logger.error('[KICK] Error in kick command:', error);
      
      // Determinar el tipo de error para dar un mensaje más específico
      let errorMessage = 'Error al expulsar usuario.';
      
      if (error.message?.includes('not-authorized') || error.message?.includes('forbidden')) {
        errorMessage = 'El bot no tiene permisos de administrador en este grupo.';
      } else if (error.message?.includes('not-participant') || error.message?.includes('not found')) {
        errorMessage = 'El usuario no se encuentra en el grupo.';
      } else if (error.message?.includes('admin')) {
        errorMessage = 'No se puede expulsar a un administrador.';
      }
      
      await sock.sendMessage(replyJid, formatError(errorMessage));
    }
  }
};
