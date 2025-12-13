﻿﻿import { getCommand } from './command-loader.js';
import PermissionManager from './permission-manager.js';
import PointsManager from './points-manager.js';
import PremiumHandler from '../handlers/premiumHandler.js';
import GroupRepository from '../repositories/GroupRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import { COMMAND_SCOPES, PERMISSION_LEVELS, PERMISSION_NAMES } from '../config/constants.js';
import { formatError } from '../utils/formatter.js';
import { normalizePhone, getUserId } from '../utils/phone.js';
import logger from '../lib/logger.js';
import { reply } from '../utils/reply.js';

const cooldowns = new Map();

export class CommandDispatcher {
  static async dispatch(context) {
    const { msg, sock, routeResult, userPhone: resolvedUserPhone } = context;
    const { text, isGroup, isDM, parsed, groupId: correctedGroupId, rawGroupId } = routeResult;

    if (!parsed) {
      logger.warn(`⚠️  No se pudo parsear: "${text}"`);
      return null;
    }

    const command = getCommand(parsed.command);
    if (!command) {
      logger.warn(`⚠️ Comando no encontrado: "${parsed.command}"`);
      return null;
    }

    logger.info(`⚡ Ejecutando: .${command.name}${parsed.args.length > 0 ? ' ' + parsed.args.join(' ') : ''}`);

    if (command.enabled === false) {
      return null;
    }

    const groupId = correctedGroupId;
    const groupJid = rawGroupId || groupId;
    const replyJid = isGroup ? (groupJid || msg.from) : msg.from;

    logger.info(`🔍 Detección desde router: isGroup=${isGroup}, isDM=${isDM}, groupId=${groupId || 'null'}, rawGroupId=${groupJid || 'null'}, replyJid=${replyJid}`);

    // DEBUG: Verificar qué está llegando
    logger.debug(`[DEBUG] resolvedUserPhone=${resolvedUserPhone}, msg.fromMe=${msg.fromMe}, msg.author=${msg.author}, msg.from=${msg.from}`);

    // Usar userPhone ya resuelto desde event-handler (puede ser LID resuelto o fallback)
    let userPhone = resolvedUserPhone;
    
    // Fallback solo si no vino resuelto
    if (!userPhone) {
      if (msg.fromMe) {
        // Bot ejecutando comando: usar getUserId
        userPhone = getUserId(msg, isGroup);

        if (!userPhone) {
          const botInfo = sock.info;
          const botPhone = botInfo?.wid?.user;
          userPhone = botPhone ? normalizePhone(botPhone) : null;
        }
        logger.info(`🤖 Bot ejecutando comando, userPhone=${userPhone}`);
      } else {
        // Usar getUserId que acepta LIDs
        userPhone = getUserId(msg, isGroup);
      }
    } else {
      logger.info(`✅ Usando userPhone resuelto: ${userPhone}`);
    }

    if (!userPhone) {
      logger.error(`❌ No se pudo determinar userPhone. msg.from="${msg.from}", fromMe=${msg.fromMe}, isGroup=${isGroup}`);
      await sock.sendMessage(replyJid, formatError('Error al identificar usuario'));
      return null;
    }

    // Verificación de scope GROUP
    if (command.scope === COMMAND_SCOPES.GROUP && !isGroup) {
      // Excepción: Permitir activación remota con .bot on <id> en DM
      // Permitimos que el comando 'bot' se ejecute en DM para manejar su propia lógica de validación
      const isRemoteBotActivation = command.name === 'bot' && isDM;
      
      if (!isRemoteBotActivation) {
        logger.warn(`⚠️ Comando ${command.name} requiere grupo pero se ejecutó en DM. msg.from="${msg.from}"`);
        await sock.sendMessage(replyJid, formatError('Este comando solo funciona en grupos'));
        return null;
      }
    }

    // Verificación de scope DM
    if (command.scope === COMMAND_SCOPES.DM && !isDM) {
      await sock.sendMessage(replyJid, formatError('Este comando solo funciona en chat privado'));
      return null;
    }
    
    // Permitir activación remota desde DM para el comando 'bot'
    // La validación anterior era demasiado estricta con el número de argumentos
    // Ahora aceptamos cualquier comando 'bot' en DM para que el propio comando maneje la validación
    const isRemoteBotActivation = command.name === 'bot' && isDM;

    if (isRemoteBotActivation) {
        // Excepción: Permitir .bot on <id> en DM
        // No verificamos GroupRepository.getById aquí porque el grupo se pasará como argumento
    } else {
        const commandsWithoutActiveGroup = ['bot', 'createprize', 'deleteprize', 'ping', 'help', 'ranking', 'leaderboard'];
        if (isGroup && groupId && !commandsWithoutActiveGroup.includes(command.name) && command.scope !== COMMAND_SCOPES.ANY) {
          // CRITICAL: Verificar estado actual DIRECTO de BD (sin caché)
          const group = await GroupRepository.getById(groupId);
          if (!group || !group.isActive) {
            await sock.sendMessage(replyJid, formatError('El bot no está activo en este grupo. Usa .bot on para activarlo'));
            return null;
          }
        }
    }

    let permissions = await PermissionManager.checkPermissions(userPhone, groupJid, sock);

    // FIX: If message is from the bot/owner's account (including LIDs), force OWNER permissions
    // This solves the issue where LIDs don't match the main phone number in config/admin list.
    if (msg.fromMe) {
      permissions = { level: PERMISSION_LEVELS.OWNER, name: PERMISSION_NAMES[PERMISSION_LEVELS.OWNER] };
    }

    const requiredLevel = this.getPermissionLevel(command.permissions);

    if (permissions.level < requiredLevel) {
      await sock.sendMessage(replyJid, formatError('No tienes permisos para usar este comando'));
      return null;
    }

    if (command.pointsRequired && isGroup && groupId) {
      const hasPoints = await PointsManager.hasEnoughPoints(groupId, userPhone, command.pointsRequired);
      if (!hasPoints && permissions.level < PERMISSION_LEVELS.GLOBAL_ADMIN) {
        const currentPoints = await PointsManager.getPoints(groupId, userPhone);
        // Obtener messagesPerPoint del grupo
        const groupConfig = await GroupRepository.getConfig(groupId);
        const group = await GroupRepository.getById(groupId);
        const messagesPerPoint = groupConfig?.messagesPerPoint 
          || groupConfig?.points?.perMessages 
          || group?.config?.messagesPerPoint
          || group?.config?.points?.perMessages
          || 10;
        await sock.sendMessage(replyJid,
          `⚠️ Puntos insuficientes\n` +
          `Necesitas ${command.pointsRequired} puntos para usar este comando.\n` +
          `Actualmente tienes ${currentPoints} puntos.\n` +
          `Te faltan ${command.pointsRequired - currentPoints} puntos.\n` +
          `📈 Mantente activo en el grupo para acumular puntos.\n` +
          `Recibes 1 punto cada ${messagesPerPoint} mensajes.`
        );
        return null;
      }
    }

    // Validación de comandos premium comprados
    // Si el comando tiene purchaseRequired: true, verificar que el usuario lo haya comprado
    if (command.purchaseRequired && isGroup && groupId) {
      const hasCommand = await PremiumHandler.userHasCommand(groupId, userPhone, command.name);
      if (!hasCommand && permissions.level < PERMISSION_LEVELS.GLOBAL_ADMIN) {
        await sock.sendMessage(replyJid,
          `💰 *Comando Premium*\n\n` +
          `Este comando requiere ser comprado antes de usarlo.\n\n` +
          `📝 Usa: .buypremium ${command.name}\n` +
          `📊 Ver comandos disponibles: .premium`
        );
        return null;
      }
      // Registrar uso del comando premium
      if (hasCommand) {
        await PremiumHandler.recordCommandUsage(groupId, userPhone, command.name);
      }
    }

    if (command.cooldown) {
      const cooldownKey = `${userPhone}-${command.name}`;
      const lastUsed = cooldowns.get(cooldownKey);

      if (lastUsed) {
        const elapsed = (Date.now() - lastUsed) / 1000;
        if (elapsed < command.cooldown) {
          const remaining = Math.ceil(command.cooldown - elapsed);
          await sock.sendMessage(replyJid, `⏳ Espera ${remaining} segundos antes de usar este comando nuevamente`);
          return null;
        }
      }

      cooldowns.set(cooldownKey, Date.now());
    }

    try {
      // Buscar miembro por phone O lid (unificación)
      let member = null;
      if (isGroup && groupId) {
        const isLid = userPhone.includes('@lid');
        const phone = isLid ? null : userPhone;
        const lid = isLid ? userPhone : null;
        const found = await MemberRepository.findByPhoneOrLid(groupId, phone, lid);
        member = found ? found.data : null;
      }

      await command.execute({
        ...context,
        command: parsed.command,
        args: parsed.args,
        rawArgs: parsed.rawArgs,  // Texto después del comando con saltos de línea preservados
        groupId: groupId || null,
        groupJid: groupJid || null,
        replyJid,
        sendReply: (content, options) => reply(sock, msg, content, options),
        userPhone,
        isGroup,
        isDM,
        permissions,
        member
      });
    } catch (error) {
      logger.error(`Error al ejecutar comando ${command.name}:`, error);
      await sock.sendMessage(replyJid, formatError('Ocurrió un error al ejecutar el comando'));
    }

    return command;
  }

  static getPermissionLevel(permissionString) {
    switch (permissionString?.toLowerCase()) {
      case 'owner':
        return PERMISSION_LEVELS.OWNER;
      case 'global_admin':
      case 'globaladmin':
        return PERMISSION_LEVELS.GLOBAL_ADMIN;
      case 'group_admin':
      case 'groupadmin':
        return PERMISSION_LEVELS.GROUP_ADMIN;
      case 'user':
      default:
        return PERMISSION_LEVELS.USER;
    }
  }
}

export default CommandDispatcher;
