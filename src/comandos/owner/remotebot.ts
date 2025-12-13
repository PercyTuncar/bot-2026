import GroupService from '../../services/GroupService.js';
import GroupRepository from '../../repositories/GroupRepository.js';
import MemberService from '../../services/MemberService.js';
import { normalizeGroupId, normalizePhone } from '../../utils/phone.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';
import { EMOJIS } from '../../config/constants.js';

export default {
  name: 'remotebot',
  description: 'Activar o desactivar el bot en un grupo remoto (solo owner)',
  category: 'owner',
  permissions: 'owner',
  scope: 'dm',
  cooldown: 5,
  enabled: true,

  async execute({ sock, msg, args, userPhone, replyJid }) {
    await msg.react(EMOJIS.LOADING);
    const action = args[0]?.toLowerCase(); // 'on' o 'off'
    const groupId = args[1]; // ID del grupo
    
    if (!action || !['on', 'off'].includes(action)) {
      await sock.sendMessage(replyJid, 
        formatError('Uso incorrecto\n\nUso: .remotebot {on|off} {groupId}\nEjemplo: .remotebot on 120363276446666223@g.us')
      );
      return;
    }
    
    if (!groupId) {
      await sock.sendMessage(replyJid, 
        formatError('Debes especificar el ID del grupo\n\nUsa .listgroups para ver los grupos disponibles')
      );
      return;
    }
    
    try {
      const normalized = normalizeGroupId(groupId);
      
      if (action === 'on') {
        // ACTIVAR BOT
        logger.info(`[BOT ACTIVATION] Activating bot in group ${normalized}`);
        
        // Verificar que el grupo existe y obtener datos
        let chat;
        try {
          chat = await sock.getChatById(normalized);
        } catch (error) {
          await sock.sendMessage(replyJid, 
            formatError('No se pudo acceder al grupo. Verifica que el bot esté en el grupo y que el ID sea correcto.')
          );
          return;
        }
        
        if (!chat.isGroup) {
          await sock.sendMessage(replyJid, formatError('El ID proporcionado no corresponde a un grupo'));
          return;
        }
        
        // Crear/actualizar grupo en BD con todos los metadatos
        const groupData = await GroupService.createOrUpdateGroup(chat);
        
        // Activar el grupo
        await GroupRepository.update(normalized, {
          isActive: true,
          activatedAt: new Date()
        });
        
        // Sincronizar miembros
        await sock.sendMessage(replyJid, `${EMOJIS.LOADING} Sincronizando miembros del grupo...`);
        await MemberService.syncGroupMembers(chat, sock);
        
        // Obtener conteos
        const group = await GroupRepository.getById(normalized);
        
        let response = `✅ *BOT ACTIVADO*\n\n`;
        response += `Grupo: ${group.name}\n`;
        response += `Miembros registrados: ${group.memberCount || 0}\n`;
        response += `Admins detectados: ${group.adminCount || 0}\n\n`;
        response += `El bot está ahora activo en este grupo.`;
        
        await sock.sendMessage(replyJid, response);
        
        // Enviar mensaje al grupo
        try {
          const groupMessage = 
            `🤖 *BOT ACTIVADO*\n\n` +
            `¡Hola! Ahora estoy activo en este grupo.\n\n` +
            `💎 Sistema de puntos habilitado\n` +
            `🎁 Comandos premium disponibles\n` +
            `📋 Usa .help para ver comandos\n\n` +
            `Administrador: @${normalizePhone(userPhone)}`;
          
          await sock.sendMessage(normalized, groupMessage);
        } catch (error) {
          logger.warn('No se pudo enviar mensaje al grupo:', error);
        }
        
        logger.info(`${EMOJIS.SUCCESS} Bot activado en grupo ${group.name}`);
        await msg.react(EMOJIS.SUCCESS);
        
      } else {
        // DESACTIVAR BOT
        logger.info(`[BOT DEACTIVATION] Deactivating bot in group ${normalized}`);
        
        const group = await GroupRepository.getById(normalized);
        
        if (!group) {
          await sock.sendMessage(replyJid, formatError('Grupo no encontrado en la base de datos'));
          return;
        }
        
        await GroupRepository.update(normalized, {
          isActive: false
        });
        
        let response = `⏸️ *BOT DESACTIVADO*\n\n`;
        response += `Grupo: ${group.name}\n`;
        response += `El bot ya no procesará mensajes en este grupo.\n\n`;
        response += `💡 Para reactivar: .bot on ${normalized}`;
        
        await sock.sendMessage(replyJid, response);
        
        // Enviar mensaje de despedida al grupo
        try {
          await sock.sendMessage(normalized, 
            `⏸️ *Bot desactivado*\n\nEl bot ha sido desactivado en este grupo.`
          );
        } catch (error) {
          logger.warn('No se pudo enviar mensaje al grupo:', error);
        }
        
        logger.info(`${EMOJIS.SUCCESS} Bot desactivado en grupo ${group.name}`);
        await msg.react(EMOJIS.SUCCESS);
      }
      
    } catch (error) {
      logger.error(`${EMOJIS.ERROR} Error en comando bot:`, error);
      await msg.react(EMOJIS.ERROR);
      await sock.sendMessage(replyJid, formatError(`Error: ${error.message}`));
    }
  }
};
