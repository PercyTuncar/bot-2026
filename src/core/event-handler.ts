import CommandDispatcher from './command-dispatcher.js';
import MessageRouter from './message-router.js';
import MessageService from '../services/MessageService.js';
import PointsService from '../services/PointsService.js';
import GroupService from '../services/GroupService.js';
import MemberService from '../services/MemberService.js';
import WelcomeService from '../services/WelcomeService.js';
import ModerationService from '../services/ModerationService.js';
import GroupRepository from '../repositories/GroupRepository.js';
import { normalizePhone, getUserId, normalizeGroupId, extractIdFromWid, getCanonicalId } from '../utils/phone.js';
import { extractParticipants } from '../utils/group.js';
import { resolveLidToPhone } from '../utils/lid-resolver.js';
import logger from '../lib/logger.js';

export class EventHandler {
  private sock: any;
  private processedMessages: Map<string, number>;

  constructor(sock) {
    this.sock = sock;
    // Cache para evitar procesar el mismo mensaje dos veces
    // Usa el ID único del mensaje de WhatsApp si está disponible
    this.processedMessages = new Map();
    // Limpiar cache cada 2 minutos para evitar memory leak
    setInterval(() => {
      const now = Date.now();
      // Mantener solo mensajes de los últimos 2 minutos
      for (const [key, timestamp] of this.processedMessages.entries()) {
        if (now - timestamp > 2 * 60 * 1000) {
          this.processedMessages.delete(key);
        }
      }
    }, 60 * 1000); // Ejecutar limpieza cada minuto
  }

  /**
   * Maneja mensajes
   */
  async handleMessage(msg) {
    try {
      // Crear ID único basado en timestamp y from
      const messageId = msg.id?.id || msg.id?._serialized ||
        `${msg.timestamp || Date.now()}_${msg.from}_${(msg.body || '').substring(0, 30)}`;

      // Evitar procesar el mismo mensaje dos veces
      if (this.processedMessages.has(messageId)) {
        return;
      }
      this.processedMessages.set(messageId, Date.now());

      // Ensure text is always a string
      let text = msg.body || '';
      if (typeof text !== 'string') {
        text = '';
      }

      // Ensure fromMe is boolean
      msg.fromMe = !!msg.fromMe;

      // CRÍTICO: En whatsapp-web.js con LIDs:
      // - msg.from = ID del chat (grupo@g.us o usuario@c.us)
      // - msg.to = destinatario (puede ser el bot en grupos)
      // - msg.author = quien envió (solo en grupos, puede ser LID)
      
      // DEBUG: Log raw message structure
      logger.debug(`[MSG DEBUG] from=${msg.from}, to=${msg.to}, author=${typeof msg.author === 'string' ? msg.author : JSON.stringify(msg.author)}`);

      // CORRECCIÓN: msg.from es el chat/grupo, NO msg.to
      // msg.to puede ser el bot que recibe el mensaje
      const chatId = msg.from;

      // Detectar si es grupo: msg.from termina en @g.us
      const isGroup = chatId && chatId.endsWith('@g.us');
      const groupId = isGroup ? chatId : null;
      
      logger.debug(`[MSG DEBUG] chatId=${chatId}, isGroup=${isGroup}, groupId=${groupId}`);

      // Obtener identificador único del usuario (PRIORIZA LID completo sobre número)
      let userPhone = getUserId(msg, isGroup);
      
      logger.debug(`[MSG DEBUG] getUserId returned: ${userPhone || 'EMPTY'}`);

      // Si getUserId no pudo extraer nada, intentar casos especiales
      if (!userPhone) {
        // CASO ESPECIAL: msg.from es LID@g.us y msg.to es usuario@c.us → es DM desde Web
        if (msg.from && msg.from.includes('@g.us') && msg.to && msg.to.endsWith('@c.us')) {
          userPhone = normalizePhone(msg.to);
          logger.info(`📱 DM desde Web detectado: usando msg.to = ${userPhone}`);
        }
      }

      // ESTRATEGIA CANÓNICA: Normalizar siempre a @c.us (Número de teléfono)
      // Esto unifica LIDs y números en una sola identidad en la base de datos
      const originalUserId = userPhone;
      
      if (userPhone) {
        try {
            // Usamos getCanonicalId que maneja LIDs, formats, etc.
            // Esta es la SOLUCIÓN DEFINITIVA para evitar usuarios duplicados
            const canonical = await getCanonicalId(this.sock, userPhone);
            
            // Si obtuvimos un canonical diferente (y es un teléfono real @c.us), lo usamos
            if (canonical && canonical !== userPhone && canonical.includes('@c.us')) {
                const canonicalPhone = canonical.replace('@c.us', '');
                // Solo logear si hubo un cambio real (ej: LID -> Phone)
                if (canonicalPhone !== userPhone) {
                    logger.info(`🔄 ID canónico resuelto: ${userPhone} → ${canonicalPhone}`);
                    userPhone = canonicalPhone; // Actualizamos userPhone para que sea el número limpio
                }
            } else if (userPhone.includes('@lid') && groupId) {
                 // Fallback específico para LIDs en grupos si getCanonicalId falló (backup con resolveLidToPhone)
                 // resolveLidToPhone usa store-parsing específico de grupos que puede ser más efectivo localmente
                 const resolved = await resolveLidToPhone(this.sock, groupId, userPhone);
                 if (resolved) {
                     logger.info(`🔄 LID resuelto a número real (fallback grupo): ${userPhone} → ${resolved}`);
                     userPhone = resolved;
                 }
            }
        } catch (canonError) {
            logger.warn(`Error obteniendo canonical ID: ${canonError.message}`);
        }
      }

      // Log del identificador obtenido
      if (originalUserId !== userPhone) {
        logger.debug(`🏷️ Identificador transformado: ${originalUserId} → ${userPhone}`);
      }

      // Validar userPhone (puede ser número o LID completo)
      if (!userPhone) {
        // Solo logear si no es un mensaje del bot mismo
        if (!msg.fromMe) {
          logger.warn(`⚠️ No se pudo extraer identificador del mensaje.`);
          logger.warn(`   msg.from: ${msg.from}`);
          logger.warn(`   msg.to: ${msg.to || 'undefined'}`);
          logger.warn(`   msg.author: ${msg.author || 'undefined'}`);
          logger.warn(`   isGroup: ${isGroup}`);
        }
        return;
      }

      // Log simplificado y legible
      if (text.trim().startsWith('.')) {
        logger.info(`📨 Comando recibido: "${text}" de ${userPhone} (${isGroup ? 'grupo' : 'DM'}), msg.from="${msg.from}"`);
      }

      // Ignorar mensajes del bot - pero verificar correctamente
      // En whatsapp-web.js, fromMe puede ser true incluso para mensajes recibidos en algunos casos
      // Verificamos también si el remitente es el mismo que el bot
      const botInfo = this.sock.info;
      const botPhone = botInfo?.wid?.user;

      // Normalizar números de teléfono (manejar @c.us, @s.whatsapp.net, @g.us)
      const senderPhone = userPhone.replace('@s.whatsapp.net', '').replace('@g.us', '').replace('@c.us', '');
      const normalizedBotPhone = botPhone ? botPhone.replace('@s.whatsapp.net', '').replace('@g.us', '').replace('@c.us', '') : null;

      // Solo ignorar si fromMe es true Y el remitente es realmente el bot
      // PERO permitir que el owner (mismo número) pueda enviar comandos
      const isOwner = normalizedBotPhone && senderPhone === normalizedBotPhone;
      const isCommand = text.trim().startsWith('.');

      if (msg.fromMe && isOwner && !isCommand) {
        // Silenciar logs de mensajes del bot que no son comandos
        return;
      }

      // Si es el owner enviando un comando, procesarlo
      if (isOwner && isCommand) {
        logger.info(`👤 Owner enviando comando: "${text}"`);
      }

      // Log para mensajes normales (no comandos)
      if (!isCommand && text.trim().length > 0) {
        logger.info(`💬 Mensaje de ${userPhone} (${isGroup ? 'grupo' : 'DM'}): "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
      }

      const routeResult = await MessageRouter.route(msg);

      if (routeResult.isCommand) {
        logger.info(`🔍 Comando detectado: "${text}" → ${routeResult.parsed?.command || 'desconocido'}`);
      }

      // Guardar mensaje
      if (routeResult.isGroup) {
        // STRIPPED: getByIdDirect is deprecated, getById is now lazy-loaded and direct.
        const group = await GroupRepository.getById(routeResult.groupId);

        logger.info(`📊 Group check: groupId=${routeResult.groupId}, exists=${!!group}, isActive=${group?.isActive}`);

        if (group && group.isActive) {
          // Extract author name from message if available to ensure correct registration
          const authorName = msg._data?.notifyName || msg.pushName || msg.notifyName;

          // UNIFICACIÓN DE IDENTIDAD: Obtener o crear miembro
          // Esto evita duplicación y actualiza LID automáticamente
          logger.info(`👤 Getting or creating member: userId=${userPhone}, name=${authorName || 'unknown'}`);
          await MemberService.getOrCreateUnified(routeResult.groupId, userPhone, this.sock, { authorName });

          // MODERACIÓN AUTOMÁTICA (solo para mensajes no-comando)
          if (!routeResult.isCommand) {
            const groupConfig = await GroupRepository.getConfig(routeResult.groupId);
            const config = groupConfig || group?.config || {};

            // 1. Verificar anti-spam
            const spamCheck = await ModerationService.checkAntiSpam(userPhone, routeResult.groupId, config);
            if (spamCheck.violation) {
              await ModerationService.handleViolation(this.sock, msg, spamCheck, routeResult.groupId, userPhone);
              return; // Detener procesamiento
            }

            // 2. Verificar palabras prohibidas
            const bannedWordsCheck = await ModerationService.checkBannedWords(routeResult.groupId, text, config);
            if (bannedWordsCheck.violation) {
              await ModerationService.handleViolation(this.sock, msg, bannedWordsCheck, routeResult.groupId, userPhone);
              return; // Detener procesamiento
            }

            // 3. Verificar anti-link
            const antiLinkCheck = await ModerationService.checkAntiLink(routeResult.groupId, text, config);
            if (antiLinkCheck.violation) {
              await ModerationService.handleViolation(this.sock, msg, antiLinkCheck, routeResult.groupId, userPhone);
              return; // Detener procesamiento
            }
          }

          logger.info(`💾 Saving message: groupId=${routeResult.groupId}, author=${userPhone}, isCommand=${routeResult.isCommand}`);
          await MessageService.saveMessage(routeResult.groupId, msg, routeResult.isCommand, userPhone, this.sock);
          logger.info(`✅ Message saved successfully`);

          // Procesar puntos (si no es comando O si es .mypoints para que cuente)
          // User requested: ".mypoints ya cuenta como +1"
          // We allow all commands to count if they are not spammy, but strictly obeying user request:
          const commandName = routeResult.parsed?.command;
          const shouldCountForPoints = !routeResult.isCommand || commandName === 'mypoints';

          if (shouldCountForPoints) {
            logger.info(`🎯 Processing points for: groupId=${routeResult.groupId}, userId=${userPhone}`);
            const pointsResult = await PointsService.processMessage(routeResult.groupId, msg, userPhone);
            logger.info(`✅ Points processed: ${pointsResult ? 'success' : 'null'}`);

      // Notificar al usuario si ganó un punto
      if (pointsResult?.pointsAdded) {
        try {
          // En whatsapp-web.js, msg.author es el participante en grupos
          const participantJid = isGroup ? msg.author : msg.from;
          await this.sock.sendMessage(msg.from, `@${String(participantJid).split('@')[0]} ${pointsResult.message}`, { mentions: [participantJid] });

          // Notificar si subió de nivel
          if (pointsResult.levelUp && pointsResult.levelUp.leveled) {
            await this.sock.sendMessage(msg.from, `@${userPhone.replace('@s.whatsapp.net', '').replace('@c.us', '')} ${pointsResult.levelUp.message}`, { mentions: [participantJid] });
          }
        } catch (error) {
          logger.error('Error al enviar notificación de punto:', error);
        }
      }
          }
        }
      } else {
        // Mensaje privado
        await MessageService.savePrivateMessage(userPhone, msg, routeResult.isCommand);
      }

      // Procesar comando
      if (routeResult.isCommand) {
        await CommandDispatcher.dispatch({
          msg,
          sock: this.sock,
          routeResult, // <--- Pasar el resultado del router
          userPhone // <--- Pasar userPhone resuelto desde event-handler
        });
      }
    } catch (error) {
      logger.error('Error al manejar mensaje:', error);
    }
  }

  /**
   * Maneja cambios de participantes
   */
  async handleGroupParticipantsUpdate(update) {
    try {
      logger.info(`👥 Group Participants Update: ${JSON.stringify(update)}`);
      const { id: groupId, participants, action } = update;

      // STRIPPED: getByIdDirect is deprecated.
      const group = await GroupRepository.getById(groupId);

      if (!group) {
        logger.warn(`⚠️ Group not found in DB for update: ${JSON.stringify(groupId)}`);
        return;
      }

      if (!group.isActive) {
        logger.info(`ℹ️ Group ${group.id} is not active, ignoring participant update`);
        return;
      }

      for (const participantId of participants) {
        // Asegurar que tenemos un string ID
        const idString = extractIdFromWid(participantId);
        
        let phone = normalizePhone(idString);
        // Si normalizePhone devuelve vacío pero es un LID, usar el LID
        if (!phone && idString && idString.includes('@lid')) {
          phone = idString;
        }

        if (action === 'add') {
          if (phone) {
            logger.info(`👤 Member joined: ${phone} in group ${groupId}`);
            await this.handleMemberJoin(groupId, phone);
          } else {
            logger.warn(`⚠️ Member joined event ignored: Could not extract phone from ${JSON.stringify(participantId)}`);
          }
        } else if (action === 'remove') {
          if (phone) {
            logger.info(`👤 Member left: ${phone} in group ${groupId}`);
            await this.handleMemberLeave(groupId, phone);
          } else {
            logger.warn(`⚠️ Member left event ignored: Could not extract phone from ${JSON.stringify(participantId)}`);
          }
        }
      }
    } catch (error) {
      logger.error('Error al manejar cambio de participantes:', error);
    }
  }

  /**
   * Maneja evento group_join (Backup para group_participants_update)
   * En whatsapp-web.js, notification tiene:
   * - getRecipientContacts(): retorna array de Contacts de los que se unieron
   * - recipientIds: array de IDs de los que se unieron
   */
  async handleGroupJoin(notification) {
    try {
      logger.info(`👥 Group Join Notification received`);
      const groupId = normalizeGroupId(notification.chatId || notification.id?.remote);
      const participantIds = notification.recipientIds || [];

      const group = await GroupRepository.getById(groupId);
      if (!group || !group.isActive) {
        logger.info(`ℹ️ Group Join ignored (group inactive or not found): ${groupId}`);
        return;
      }

      // ============================================================
      // MÉTODO CORRECTO: Usar getRecipientContacts() para obtener Contacts
      // Esto retorna un array de objetos Contact con pushname
      // ============================================================
      let recipientContacts: any[] = [];
      try {
        if (typeof notification.getRecipientContacts === 'function') {
          recipientContacts = await notification.getRecipientContacts();
          logger.info(`✅ getRecipientContacts() returned ${recipientContacts.length} contacts`);
          
          // Log detallado de cada contact recibido
          recipientContacts.forEach((c, idx) => {
            logger.debug(`   Contact[${idx}]: id=${c?.id?._serialized}, pushname="${c?.pushname}", name="${c?.name}", shortName="${c?.shortName}", notify="${c?.notify || c?.notifyName}"`);
          });
        }
      } catch (err: any) {
        logger.warn(`⚠️ getRecipientContacts() failed: ${err.message}`);
      }

      // EXTRA: Intentar obtener información del body de la notificación
      // A veces el nombre viene en notification.body o notification._data
      const notificationBody = notification.body || notification._data?.body || '';
      const notificationData = notification._data || {};
      logger.debug(`📋 Notification body: "${notificationBody}", hasData: ${!!notificationData}`);

      // Procesar cada participante
      for (let i = 0; i < participantIds.length; i++) {
        const participantId = participantIds[i];
        // Asegurar que tenemos un string ID
        const idString = extractIdFromWid(participantId);
        
        let phone = normalizePhone(idString);
        // Si normalizePhone devuelve vacío pero es un LID, usar el LID
        if (!phone && idString && idString.includes('@lid')) {
          phone = idString;
        }

        // Obtener el Contact correspondiente a este participante
        let contact = recipientContacts[i] || null;
        
        // Verificar si el contact tiene datos válidos
        const hasValidContactData = contact && (
          (contact.pushname && contact.pushname !== 'undefined') ||
          (contact.name && contact.name !== 'undefined') ||
          (contact.shortName && contact.shortName !== 'undefined') ||
          (contact.notify && contact.notify !== 'undefined')
        );
        
        logger.info(`👤 Member joined (via notification): ${phone} in group ${groupId}`);
        logger.info(`   Contact info: pushname="${contact?.pushname}", name="${contact?.name}", shortName="${contact?.shortName}", notify="${contact?.notify}", hasValidData=${hasValidContactData}`);
        
        if (phone) {
          // Pasar el Contact específico de este participante (solo si tiene datos válidos)
          await this.handleMemberJoin(groupId, phone, hasValidContactData ? contact : null);
        } else {
          logger.warn(`⚠️ Could not extract phone/lid from participantId: ${participantId}`);
        }
      }
    } catch (error) {
      logger.error('Error handling group join:', error);
    }
  }

  /**
   * Maneja evento group_leave (Backup para group_participants_update)
   */
  async handleGroupLeave(notification) {
    try {
      logger.info(`👥 Group Leave Notification: ${JSON.stringify(notification)}`);
      const groupId = normalizeGroupId(notification.chatId || notification.id?.remote);
      const participants = notification.recipientIds || [];

      const group = await GroupRepository.getById(groupId);
      if (!group || !group.isActive) return;

      for (const participantId of participants) {
        // Asegurar que tenemos un string ID
        const idString = extractIdFromWid(participantId);
        
        let phone = normalizePhone(idString);
        // Si normalizePhone devuelve vacío pero es un LID, usar el LID
        if (!phone && idString && idString.includes('@lid')) {
          phone = idString;
        }
        
        logger.info(`👤 Member left (via notification): ${phone} in group ${groupId}`);
        if (phone) {
          await this.handleMemberLeave(groupId, phone);
        } else {
          logger.warn(`⚠️ Could not extract phone/lid from participantId: ${participantId}`);
        }
      }
    } catch (error) {
      logger.error('Error handling group leave:', error);
    }
  }

  /**
   * Maneja ingreso de miembro
   * @param groupId - ID del grupo
   * @param phone - Número/LID del participante
   * @param contactFromNotification - Contact object obtenido de getRecipientContacts() si disponible
   */
  async handleMemberJoin(groupId: string, phone: string, contactFromNotification?: any) {
    try {
      // WAIT: Esperar para que WhatsApp sincronice metadatos del nuevo miembro
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Intentar obtener info del participante
      let displayName: string | null = null;
      let memberCount = 0;
      let contactObject = null;

      try {
        // 1. Usar el extractor robusto de MemberService (incluye hidratación y soporte para LIDs)
        // Pasamos groupId para habilitar resolución de LID a Phone si es necesario
        displayName = await MemberService.extractUserProfileName(this.sock, phone, groupId);
        
        // 2. Si falló y tenemos info de la notificación, usarla como fallback
        if (!displayName && contactFromNotification) {
          contactObject = contactFromNotification;
          // Helper local para validar
          const isValid = (n) => n && typeof n === 'string' && n.trim().length > 0 && n !== 'undefined';
          
          if (isValid(contactFromNotification.pushname)) displayName = contactFromNotification.pushname;
          else if (isValid(contactFromNotification.notifyName)) displayName = contactFromNotification.notifyName;
          else if (isValid(contactFromNotification.name)) displayName = contactFromNotification.name;
        }

        // 3. Obtener conteo de miembros (necesario para el mensaje de bienvenida)
        const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
        try {
          const chat = await this.sock.getChatById(targetJid);
          if (chat && chat.participants) {
            memberCount = chat.participants.length;
            
            // Último recurso: buscar en participants del chat si aún no tenemos nombre
            if (!displayName) {
              const participant = chat.participants.find((p: any) => {
                const pId = p?.id?._serialized || p?.id;
                return pId === phone || normalizePhone(pId) === normalizePhone(phone);
              });

              if (participant) {
                const isValid = (n) => n && typeof n === 'string' && n.trim().length > 0 && n !== 'undefined';
                if (isValid(participant.pushname)) displayName = participant.pushname;
                else if (isValid(participant.notify)) displayName = participant.notify;
                else if (isValid(participant.notifyName)) displayName = participant.notifyName;
              }
            }
          }
        } catch (e: any) {
          logger.debug(`getChatById failed during join: ${e.message}`);
        }

      } catch (err: any) {
        logger.warn(`Error obteniendo metadata para ${phone}: ${err.message}`);
      }

      // Log final
      if (displayName) {
        logger.info(`👤 ✅ Final displayName: "${displayName}"`);
      } else {
        logger.info(`👤 ⚠️ No se encontró nombre válido para ${phone}, usando fallback "Usuario"`);
        displayName = "Usuario";
      }

      // Registrar/crear miembro y asegurar estado consistente
      try {
        await MemberService.getOrCreateUnified(groupId, phone, this.sock, { authorName: displayName });
      } catch (e: any) {
        logger.debug(`getOrCreateUnified failed: ${e.message}`);
      }
      try {
        const numericPhone = phone.includes('@') ? phone.split('@')[0] : phone;
        const { MemberRepository } = await import('../repositories/MemberRepository.js');
        await MemberRepository.mergeMemberDocs(groupId, numericPhone, phone);
      } catch (e: any) {
        logger.debug(`mergeMemberDocs failed: ${e.message}`);
      }
      // Resetear advertencias al ingresar (ex-miembros vuelven con contador en 0)
      try {
        const { WarningService } = await import('../services/WarningService.js');
        await WarningService.resetWarnings(groupId, phone, undefined, 'Ingreso al grupo (reset)');
      } catch (e: any) {
        logger.debug(`resetWarnings on join failed: ${e.message}`);
      }
      // Enviar bienvenida
      await WelcomeService.sendWelcome(this.sock, groupId, phone, displayName, memberCount, contactObject);
    } catch (error) {
      logger.error(`Error al manejar ingreso de miembro:`, error);
    }
  }

  /**
   * Maneja salida de miembro
   * Registra la salida en el historial según documentación
   */
  async handleMemberLeave(groupId, phone, wasKicked = false) {
    try {
      const member = await MemberService.getMemberInfo(groupId, phone);
      
      // Registrar salida en el historial (incrementar total_exits)
      const { WarningService } = await import('../services/WarningService.js');
      await WarningService.logExit(groupId, phone, wasKicked);
      
      if (member) {
        await MemberService.removeMember(groupId, phone);
        await WelcomeService.sendGoodbye(this.sock, groupId, phone, member.displayName);
      }
      
      logger.info(`👋 Member exit logged: ${phone} from group ${groupId}, wasKicked=${wasKicked}`);
    } catch (error) {
      logger.error(`Error al manejar salida de miembro:`, error);
    }
  }
}

export default EventHandler;

