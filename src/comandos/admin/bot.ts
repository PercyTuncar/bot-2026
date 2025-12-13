﻿import GroupService from '../../services/GroupService.js';
import { formatError } from '../../utils/formatter.js';
import { normalizePhone, normalizeGroupId, phoneToJid, groupIdToJid } from '../../utils/phone.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
import { resolveGroupMetadata } from '../../utils/group.js';

export default {
  name: 'bot',
  description: 'Activar/desactivar bot en el grupo',
  category: 'admin',
  permissions: 'group_admin',
  scope: 'all', // Cambiado de 'group' a 'all' para permitir uso en DM
  cooldown: 10,

  async execute({ sock, msg, args, groupId, groupJid, userPhone, replyJid, isDM }) {
    const action = args[0]?.toLowerCase();
    
    // Si estamos en DM y pasan un ID de grupo, usar ese ID
    // Si estamos en Grupo, usar el ID del grupo actual
    let targetGroupId = groupId;
    let isRemoteActivation = false;

    // Detectar activación remota desde DM: .bot on 120363199955210379
    // Usamos isDM que es la propiedad correcta pasada por el dispatcher
    if (isDM && args[1]) {
        targetGroupId = normalizeGroupId(args[1]);
        isRemoteActivation = true;
    }

    // Validar que tengamos un grupo objetivo
    if (!targetGroupId) {
        await sock.sendMessage(replyJid, formatError('Debes usar este comando en un grupo o especificar el ID del grupo en DM (ej: .bot on 123456)'));
        return;
    }

    const targetGroupJid = groupIdToJid(targetGroupId);

    if (action === 'on') {
      try {
        await msg.react(EMOJIS.LOADING);

        // Usar el userPhone pasado por el dispatcher (ya resuelto por event-handler)
        const adminPhone = userPhone;

        if (!adminPhone) {
          throw new Error('No se pudo determinar el teléfono del admin');
        }

        logger.info(`[bot] Activando bot en grupo ${targetGroupId} (jid=${targetGroupJid}) por admin ${adminPhone}`);

        let groupMetadata;
        try {
          // Si es activación remota, resolvemos metadata usando el ID específico
          groupMetadata = await resolveGroupMetadata(sock, targetGroupId, isRemoteActivation ? null : msg);
          
          // Validación extra: Verificar que el bot sea admin o miembro del grupo remoto
          if (!groupMetadata) throw new Error('No se pudo acceder a la información del grupo');
          
        } catch (error) {
          logger.error(`[bot] Error al obtener metadatos del grupo ${targetGroupId}:`, error);
          throw new Error(`El chat no es un grupo, no existe o el bot no es miembro. Detalles: ${error.message}`);
        }

        // Normalizar el ID del grupo - normalizeGroupId ahora maneja objetos WID correctamente
        const canonicalGroupId = normalizeGroupId(groupMetadata.id) || normalizeGroupId(targetGroupId);

        if (!canonicalGroupId) {
          throw new Error('No se pudo determinar el ID del grupo.');
        }

        const groupJidForMessage = groupIdToJid(canonicalGroupId);

        logger.info(`[bot] IDs: metadataId="${typeof groupMetadata.id === 'object' ? JSON.stringify(groupMetadata.id) : groupMetadata.id}", canonical="${canonicalGroupId}", jid="${groupJidForMessage}"`);

        const result = await GroupService.activateGroup(canonicalGroupId, groupMetadata, sock);

        if (result.outcome === 'ALREADY_ACTIVE') {
          if (isRemoteActivation) {
             // Respuesta en DM
             await sock.sendMessage(replyJid, `${EMOJIS.WARNING} El bot ya está activo en el grupo ${groupMetadata.subject || canonicalGroupId}`);
          } else {
             // Respuesta en Grupo
             await sock.sendMessage(groupJidForMessage, `${EMOJIS.WARNING} El bot ya está activo y funcionando`);
          }
          await msg.react(EMOJIS.WARNING);
          return;
        }

        await msg.react(EMOJIS.SUCCESS);

        if (isRemoteActivation) {
            // ACTIVACIÓN SILENCIOSA (REMOTE): Confirmación solo por DM
            await sock.sendMessage(replyJid,
              `${EMOJIS.ROBOT} *Bot Activado (Silencioso)*\n\n` +
              `✅ El bot se ha activado correctamente en el grupo:\n` +
              `🏷️ *${groupMetadata.subject || 'Grupo desconocido'}*\n` +
              `🆔 ${canonicalGroupId}\n\n` +
              `👥 Participantes: ${groupMetadata.participants?.length || 0}\n` +
              `🤫 No se envió notificación al grupo.`
            );
        } else {
            // ACTIVACIÓN NORMAL (EN GRUPO): Notificación al grupo
            await sock.sendMessage(groupJidForMessage,
              `${EMOJIS.ROBOT} *Bot Activado*\n\n` +
              `✅ El bot está ahora activo en este grupo.\n` +
              ` Total participantes: ${groupMetadata.participants?.length || 0}\n` +
              `🎯 Sistema de puntos: Activo (1 punto cada 10 mensajes)\n\n` +
              `Usa .help para ver todos los comandos disponibles.`
            );
        }

      } catch (error) {
        logger.error(`[bot] Error al activar bot en grupo ${targetGroupId}:`, error);
        await msg.react(EMOJIS.ERROR);
        await sock.sendMessage(replyJid, formatError(`Error al activar el bot: ${error.message}`));
      }
    } else if (action === 'off') {
      try {
        if (targetGroupId) {
          await GroupService.deactivateGroup(targetGroupId);
        }
        
        const message = `${EMOJIS.ROBOT} Bot desactivado\nEl bot ya no guardará mensajes ni responderá comandos (excepto .bot on)`;
        
        if (isRemoteActivation) {
             await sock.sendMessage(replyJid, `✅ Bot desactivado en el grupo ${targetGroupId}`);
        } else {
             await sock.sendMessage(targetGroupJid, message);
        }

      } catch (error) {
        await sock.sendMessage(replyJid, formatError('Error al desactivar el bot'));
      }
    } else {
      await sock.sendMessage(replyJid,
        `Uso: .bot on/off [ID_GRUPO]\n` +
        `on - Activa el bot (en el grupo actual o ID especificado)\n` +
        `off - Desactiva el bot`
      );
    }
  }
};

