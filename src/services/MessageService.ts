import MessageRepository from '../repositories/MessageRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import GroupRepository from '../repositories/GroupRepository.js';
import { MemberService } from './MemberService.js';
import { getFirestore } from '../config/firebase.js';
import { getNow } from '../utils/time.js';
import { normalizePhone, normalizeGroupId, getUserId, getDisplayNameFromMessage } from '../utils/phone.js';
import logger from '../lib/logger.js';

export class MessageService {
  /**
   * Guarda un mensaje con TODOS los metadatos disponibles
   * SPEC: Section 3.3 - Registro completo de mensajes
   * @param {string} userPhone - Número de teléfono del autor ya resuelto (puede ser LID extraído)
   * @param {object} sock - Cliente de WhatsApp (para obtener Contacts al crear miembros)
   */
  static async saveMessage(groupId, msg, isCommand = false, userPhone = null, sock = null) {
    const startTime = Date.now();
    groupId = normalizeGroupId(groupId);
    
    try {
      // Verificar que el grupo está activo
      const group = await GroupRepository.getById(groupId);
      if (!group || !group.isActive) {
        logger.debug(`Message not saved - group ${groupId} is inactive`);
        return { saved: false, reason: 'group_inactive' };
      }
      
      // Extraer metadatos completos del mensaje
      const messageData = await this.extractCompleteMessageMetadata(msg, groupId, isCommand, userPhone, sock);
      
      if (!messageData) {
        return { saved: false, reason: 'invalid_message' };
      }
      
      // Guardar en Firestore
      const db = getFirestore();
      await db.collection('groups')
        .doc(groupId)
        .collection('messages')
        .doc(messageData.messageId)
        .set(messageData);
      
      // UPDATE MEMBER STATS (Last Active & Message Count)
      if (messageData.authorPhone) {
        try {
          await MemberRepository.updateActivity(groupId, messageData.authorPhone);
        } catch (err) {
          logger.warn(`Failed to update activity for ${messageData.authorPhone}`, err);
        }
      }

      const duration = Date.now() - startTime;
      logger.debug(`[${new Date().toISOString()}] [CREATE] groups/${groupId}/messages/${messageData.messageId} → SUCCESS (${duration}ms)`);
      
      return { saved: true, messageData };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[${new Date().toISOString()}] [ERROR] Failed to save message in ${groupId} (${duration}ms)`, error);
      return { saved: false, reason: 'error', error };
    }
  }

  /**
   * Extrae TODOS los metadatos disponibles de un Message
   * SPEC: Section 3.3 - Estructura completa del documento message
   * @param {string} userPhone - Número de teléfono del autor ya resuelto desde event-handler
   * @param {object} sock - Cliente de WhatsApp (para obtener Contacts al crear miembros)
   */
  static async extractCompleteMessageMetadata(msg, groupId, isCommand, userPhone = null, sock = null) {
    const remoteJid = msg.to || msg.from;
    const isGroup = remoteJid?.endsWith('@g.us');
    
    // Obtener teléfono del autor (usar el ya resuelto si está disponible)
    // PRIORIDAD: userPhone pasado > getUserId (que prioriza LIDs)
    let authorPhone = userPhone || getUserId(msg, isGroup);
    
    // Validar authorPhone: puede ser número o LID completo
    if (!authorPhone) {
      logger.warn(`Invalid author phone: empty (userPhone=${userPhone}, msg.author=${msg.author})`);
      return null;
    }
    
    // Si contiene ':', es un device ID - extraer solo la parte antes de ':'
    if (authorPhone.includes(':')) {
      authorPhone = authorPhone.split(':')[0];
    }
    
    // Obtener nombre del autor
    const authorName = getDisplayNameFromMessage(msg, authorPhone);
    
    // CRITICAL: Obtener o crear member automáticamente con toda su información
    // Separar phone y lid correctamente
    const isLid = authorPhone.includes('@lid');
    const phoneForSearch = isLid ? null : authorPhone;
    const lidForSearch = isLid ? authorPhone : null;
    
    let authorDocId = authorPhone; // Por defecto
    let authorRole = 'member';
    
    try {
      // Metadata temporal para creación si no existe
      const messageMetadata = {
        authorName: authorName,
        timestamp: getNow()
      };
      
      // Optimización: evitar creación/búsqueda de miembro cuando es un comando
      if (!isCommand) {
        const member = await MemberService.getOrCreateUnified(
          groupId,
          isLid ? lidForSearch : phoneForSearch,
          sock,
          messageMetadata
        );
        
        if (member) {
          // Usar el phone del member encontrado/creado como docId
          authorDocId = member.phone;
          if (member.isSuperAdmin) authorRole = 'superadmin';
          else if (member.isAdmin) authorRole = 'admin';
          logger.debug(`✅ Member ${authorDocId} found/created with role: ${authorRole}`);
        }
      }
    } catch (error) {
      logger.warn(`Could not fetch/create member for ${authorPhone}`, error);
      // Si falló y tenemos LID, extraer phone del LID
      if (isLid) {
        authorDocId = authorPhone.split('@')[0].replace(/[^\d]/g, '');
      }
    }
    
    // Extraer texto del mensaje
    const body = msg.body || '';
    
    // Determinar tipo de mensaje
    let type = 'chat';
    if (msg.type) {
      type = msg.type; // whatsapp-web.js ya provee el tipo
    } else if (msg.hasMedia) {
      type = 'media';
    }
    
    // Extraer links del mensaje
    const links = this.extractLinks(body);
    
    // Extraer menciones
    const mentionedIds = msg.mentionedIds || [];
    
    // ============ IDENTIFICACIÓN (de Message) ============
    const messageData = {
      messageId: msg.id?.id || msg.id?._serialized || `${Date.now()}_${authorPhone}`,
      
      // ============ AUTOR ============
      authorPhone: authorDocId, // Usar docId (phone) para consistencia
      authorLid: authorPhone.includes('@lid') ? authorPhone : null, // Guardar LID si existe
      authorName,
      authorRole,
      
      // ============ CONTENIDO (de Message) ============
      body,
      type,
      
      // ============ CONTEXTO (de Message) ============
      hasMedia: msg.hasMedia || false,
      isForwarded: msg.isForwarded || false,
      isStarred: msg.isStarred || false,
      fromMe: msg.fromMe || false,
      hasQuotedMsg: msg.hasQuotedMsg || false,
      quotedMsgId: msg._data?.quotedMsg?.id || null,
      
      // ============ MENCIONES (de Message) ============
      mentionedIds,
      mentionedCount: mentionedIds.length,
      
      // ============ LINKS (de Message) ============
      links,
      hasLinks: links.length > 0,
      
      // ============ TIMESTAMPS ============
      timestamp: msg.timestamp ? new Date(msg.timestamp * 1000) : getNow(),
      
      // ============ MODERACIÓN ============
      wasDeleted: false,
      deletionReason: null,
      deletedBy: null,
      triggeredWarn: false,
      
      // ============ COMANDOS ============
      isCommand,
      commandName: isCommand ? this.extractCommandName(body) : null,
      commandSuccess: null,
      
      // ============ PUNTOS ============
      contributedToPoints: !isCommand // Los comandos no dan puntos
    };
    
    return messageData;
  }

  /**
   * Extrae links de un texto
   */
  static extractLinks(text) {
    if (!text) return [];
    
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = text.match(urlRegex);
    
    return matches || [];
  }

  /**
   * Extrae el nombre del comando del texto
   */
  static extractCommandName(text) {
    if (!text) return null;
    
    // Asume que el comando empieza con un prefijo (., !, /)
    const match = text.match(/^[.!\/](\w+)/);
    return match ? match[1].toLowerCase() : null;
  }

  /**
   * Actualiza el mensaje cuando fue eliminado por moderación
   */
  static async markAsDeleted(groupId, messageId, reason, deletedBy = 'BOT') {
    const startTime = Date.now();
    groupId = normalizeGroupId(groupId);
    
    try {
      const db = getFirestore();
      await db.collection('groups')
        .doc(groupId)
        .collection('messages')
        .doc(messageId)
        .update({
          wasDeleted: true,
          deletionReason: reason,
          deletedBy,
          deletedAt: getNow()
        });
      
      const duration = Date.now() - startTime;
      logger.debug(`[${new Date().toISOString()}] [UPDATE] groups/${groupId}/messages/${messageId} marked as deleted → SUCCESS (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[${new Date().toISOString()}] [ERROR] Failed to mark message as deleted (${duration}ms)`, error);
    }
  }

  /**
   * Actualiza el resultado de ejecución de un comando
   */
  static async updateCommandResult(groupId, messageId, success) {
    const startTime = Date.now();
    groupId = normalizeGroupId(groupId);
    
    try {
      const db = getFirestore();
      await db.collection('groups')
        .doc(groupId)
        .collection('messages')
        .doc(messageId)
        .update({
          commandSuccess: success
        });
      
      const duration = Date.now() - startTime;
      logger.debug(`[${new Date().toISOString()}] [UPDATE] groups/${groupId}/messages/${messageId} command result → SUCCESS (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[${new Date().toISOString()}] [ERROR] Failed to update command result (${duration}ms)`, error);
    }
  }

  /**
   * Guarda un mensaje privado (DM)
   * Los mensajes privados no se guardan en la estructura normal de grupos
   * Solo se loggean para debugging
   */
  static async savePrivateMessage(userPhone, msg, isCommand = false) {
    const startTime = Date.now();
    
    try {
      const messageId = msg.id?.id || msg.id?._serialized || `dm_${Date.now()}`;
      const body = msg.body || '';
      
      logger.debug(`[${new Date().toISOString()}] [DM] from ${userPhone}: ${body.substring(0, 100)} (command: ${isCommand})`);
      
      // Opcionalmente, podrías guardar los DMs en una colección separada:
      // const db = getFirestore();
      // await db.collection('private_messages').doc(messageId).set({...});
      
      const duration = Date.now() - startTime;
      return { saved: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[${new Date().toISOString()}] [ERROR] Failed to save private message (${duration}ms)`, error);
      return { saved: false, error };
    }
  }
}

export default MessageService;
