import { WASocket, proto, isJidGroup, getContentType, downloadMediaMessage, jidNormalizedUser } from '@whiskeysockets/baileys';
import CommandDispatcher from './command-dispatcher.js';
import MessageRouter from './message-router.js';
import MessageService from '../services/MessageService.js';
import PointsService from '../services/PointsService.js';
import GroupService from '../services/GroupService.js';
import MemberService from '../services/MemberService.js';
import WelcomeService from '../services/WelcomeService.js';
import ModerationService from '../services/ModerationService.js';
import GroupRepository from '../repositories/GroupRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import { normalizePhone, getUserId, normalizeGroupId, extractIdFromWid } from '../utils/phone.js';
import logger from '../lib/logger.js';

export class EventHandler {
  private sock: WASocket;
  private processedMessages: Map<string, number>;
  private processedWelcomes: Map<string, number>;

  constructor(sock: WASocket) {
    this.sock = sock;
    // Cache para evitar procesar el mismo mensaje dos veces
    this.processedMessages = new Map();
    // Cache para evitar procesar la misma bienvenida dos veces
    this.processedWelcomes = new Map();

    // Limpiar cache cada 2 minutos para evitar memory leak
    setInterval(() => {
      const now = Date.now();
      for (const [key, timestamp] of this.processedMessages.entries()) {
        if (now - timestamp > 2 * 60 * 1000) {
          this.processedMessages.delete(key);
        }
      }
      for (const [key, timestamp] of this.processedWelcomes.entries()) {
        if (now - timestamp > 2 * 60 * 1000) {
          this.processedWelcomes.delete(key);
        }
      }
    }, 60 * 1000);

    this.setupEventListeners();
  }

  /**
   * Setup all Baileys event listeners
   */
  private setupEventListeners() {
    // Handle incoming messages
    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      // Only process new messages (not history sync)
      if (type !== 'notify') return;

      for (const msg of messages) {
        await this.handleMessage(msg);
      }
    });

    // Handle group participant updates (join/leave)
    this.sock.ev.on('group-participants.update', async (update) => {
      await this.handleGroupParticipantsUpdate(update);
    });

    // Handle group metadata updates
    this.sock.ev.on('groups.update', async (updates) => {
      for (const update of updates) {
        await this.handleGroupUpdate(update);
      }
    });

    // Handle contact updates
    this.sock.ev.on('contacts.update', async (updates) => {
      for (const update of updates) {
        await this.handleContactUpdate(update);
      }
    });

    logger.info('✅ Eventos de Baileys registrados correctamente');
  }

  /**
   * Extract text from Baileys message
   */
  private getMessageText(msg: proto.IWebMessageInfo): string {
    const message = msg.message;
    if (!message) return '';

    const type = getContentType(message);

    if (type === 'conversation') {
      return message.conversation || '';
    }
    if (type === 'extendedTextMessage') {
      return message.extendedTextMessage?.text || '';
    }
    if (type === 'imageMessage') {
      return message.imageMessage?.caption || '';
    }
    if (type === 'videoMessage') {
      return message.videoMessage?.caption || '';
    }
    if (type === 'documentMessage') {
      return message.documentMessage?.caption || '';
    }

    return '';
  }

  /**
   * Get sender from Baileys message
   */
  private getSender(msg: proto.IWebMessageInfo): string {
    const isGroup = isJidGroup(msg.key.remoteJid || '');

    if (isGroup) {
      // In groups, participant contains the sender
      return msg.key.participant || '';
    }

    // In DMs, remoteJid is the sender (or us if fromMe)
    if (msg.key.fromMe) {
      return this.sock.user?.id || '';
    }

    return msg.key.remoteJid || '';
  }

  /**
   * Normalize JID to phone number
   */
  private jidToPhone(jid: string): string {
    if (!jid) return '';
    return jid.split('@')[0].split(':')[0];
  }

  /**
   * Maneja mensajes
   */
  async handleMessage(msg: proto.IWebMessageInfo) {
    try {
      // Skip status updates
      if (msg.key.remoteJid === 'status@broadcast') return;

      // Get message ID for dedup
      const messageId = msg.key.id || `${msg.messageTimestamp}_${msg.key.remoteJid}`;

      // Avoid processing same message twice
      if (this.processedMessages.has(messageId)) {
        return;
      }
      this.processedMessages.set(messageId, Date.now());

      // Extract text
      const text = this.getMessageText(msg);

      // Get chat info
      const chatId = msg.key.remoteJid || '';
      const isGroup = isJidGroup(chatId);
      const groupId = isGroup ? normalizeGroupId(chatId) : null;

      // Get sender
      let senderJid = this.getSender(msg);

      // RESOLUCIÓN DE IDENTIDAD ESTRICTA (Prevent Duplicate Records)
      // Si el sender es un LID, intentamos resolverlo al teléfono real ANTES de asignar userPhone.
      // Esto evita crear usuarios con IDs falsos como '1849800...@lid' en la base de datos.
      if (senderJid.includes('@lid')) {
        try {
          const lidMap = (this.sock as any).signalRepository?.lidMapping;
          if (lidMap) {
            const pnJid = await lidMap.getPNForLID(senderJid);
            if (pnJid) {
              const prevLid = senderJid;
              senderJid = pnJid; // REEMPLAZAR con el JID real (phone@s.whatsapp.net)
              logger.info(`🔄 [LID Resolver] Mapeo automático en mensaje: LID ${prevLid.split('@')[0]} -> Phone ${senderJid.split('@')[0]}`);
            }
          }
        } catch (e) {
          logger.warn(`⚠️ [LID Resolver] Falló resolución para ${senderJid}`);
        }
      }

      let userPhone = this.jidToPhone(senderJid);

      // Validate sender
      if (!userPhone && !msg.key.fromMe) {
        logger.warn(`⚠️ No se pudo extraer identificador del mensaje.`);
        return;
      }

      // Log commands
      if (text.trim().startsWith('.')) {
        logger.info(`📨 Comando recibido: "${text}" de ${userPhone} (${isGroup ? 'grupo' : 'DM'})`);
      }

      // Ignore messages from self (unless commands)
      const botPhone = this.jidToPhone(this.sock.user?.id || '');
      const isOwner = botPhone && userPhone === botPhone;
      const isCommand = text.trim().startsWith('.');

      if (msg.key.fromMe && isOwner && !isCommand) {
        return;
      }

      // Log owner commands
      if (isOwner && isCommand) {
        logger.info(`👤 Owner enviando comando: "${text}"`);
      }

      // Log normal messages
      if (!isCommand && text.trim().length > 0) {
        logger.info(`💬 Mensaje de ${userPhone} (${isGroup ? 'grupo' : 'DM'}): "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
      }

      // Create compatible message object for existing code
      const compatMsg = this.createCompatibleMessage(msg, text, userPhone);
      const routeResult = await MessageRouter.route(compatMsg);

      if (routeResult.isCommand) {
        logger.info(`🔍 Comando detectado: "${text}" → ${routeResult.parsed?.command || 'desconocido'}`);
      }

      // Process group messages
      if (routeResult.isGroup) {
        const group = await GroupRepository.getById(routeResult.groupId);

        logger.info(`📊 Group check: groupId=${routeResult.groupId}, exists=${!!group}, isActive=${group?.isActive}`);

        if (group && group.isActive) {
          // Get author name
          const authorName = msg.pushName || userPhone;

          // Get or create member
          logger.info(`👤 Getting or creating member: userId=${userPhone}, name=${authorName}`);
          await MemberService.getOrCreateUnified(routeResult.groupId, userPhone, this.sock, { authorName });

          // Auto-moderation (for non-commands)
          if (!routeResult.isCommand) {
            const groupConfig = await GroupRepository.getConfig(routeResult.groupId);
            const config = groupConfig || group?.config || {};

            // 1. Anti-spam check
            const spamCheck = await ModerationService.checkAntiSpam(userPhone, routeResult.groupId, config);
            if (spamCheck.violation) {
              await ModerationService.handleViolation(this.sock, compatMsg, spamCheck, routeResult.groupId, userPhone);
              return;
            }

            // 2. Banned words check
            const bannedWordsCheck = await ModerationService.checkBannedWords(routeResult.groupId, text, config);
            if (bannedWordsCheck.violation) {
              await ModerationService.handleViolation(this.sock, compatMsg, bannedWordsCheck, routeResult.groupId, userPhone);
              return;
            }

            // 3. Anti-link check
            const antiLinkCheck = await ModerationService.checkAntiLink(routeResult.groupId, text, config);
            if (antiLinkCheck.violation) {
              await ModerationService.handleViolation(this.sock, compatMsg, antiLinkCheck, routeResult.groupId, userPhone);
              return;
            }
          }

          // Save message
          logger.info(`💾 Saving message: groupId=${routeResult.groupId}, author=${userPhone}, isCommand=${routeResult.isCommand}`);
          await MessageService.saveMessage(routeResult.groupId, compatMsg, routeResult.isCommand, userPhone, this.sock);
          logger.info(`✅ Message saved successfully`);

          // Process points
          const commandName = routeResult.parsed?.command;
          const shouldCountForPoints = !routeResult.isCommand || commandName === 'mypoints';

          if (shouldCountForPoints) {
            logger.info(`🎯 Processing points for: groupId=${routeResult.groupId}, userId=${userPhone}`);
            const pointsResult = await PointsService.processMessage(routeResult.groupId, compatMsg, userPhone);
            logger.info(`✅ Points processed: ${pointsResult ? 'success' : 'null'}`);

            // Notify user if they earned a point
            if (pointsResult?.pointsAdded) {
              try {
                const mentions = [senderJid];
                await this.sock.sendMessage(chatId, {
                  text: `@${userPhone} ${pointsResult.message}`,
                  mentions
                });

                // Notify level up
                if (pointsResult.levelUp?.leveled) {
                  await this.sock.sendMessage(chatId, {
                    text: `@${userPhone} ${pointsResult.levelUp.message}`,
                    mentions
                  });
                }
              } catch (error) {
                logger.error('Error al enviar notificación de punto:', error);
              }
            }
          }
        }
      } else {
        // Private message
        await MessageService.savePrivateMessage(userPhone, compatMsg, routeResult.isCommand);
      }

      // Process command
      if (routeResult.isCommand) {
        await CommandDispatcher.dispatch({
          msg: compatMsg,
          sock: this.sock,
          routeResult,
          userPhone
        });
      }
    } catch (error) {
      logger.error('Error al manejar mensaje:', error);
    }
  }

  /**
   * Create a compatible message object for existing commands
   */
  private createCompatibleMessage(msg: proto.IWebMessageInfo, text: string, userPhone: string) {
    const chatId = msg.key.remoteJid || '';
    const isGroup = isJidGroup(chatId);
    const senderJid = this.getSender(msg);

    // Get quoted message
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
    const quotedStanzaId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;

    return {
      // Core properties
      id: {
        id: msg.key.id,
        _serialized: msg.key.id,
        fromMe: msg.key.fromMe
      },
      from: chatId,
      to: chatId,
      author: senderJid,
      body: text,
      type: getContentType(msg.message || {}) || 'text',
      timestamp: Number(msg.messageTimestamp) || Date.now(),
      hasMedia: !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.documentMessage),
      fromMe: msg.key.fromMe || false,
      pushName: msg.pushName || userPhone,
      mentionedIds: msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
      hasQuotedMsg: !!quotedMsg,

      // Baileys native data
      key: msg.key,
      message: msg.message,

      // Internal data for compatibility
      _data: {
        participant: senderJid,
        from: chatId,
        pushName: msg.pushName,
        quotedMsg: quotedMsg ? {
          id: quotedStanzaId,
          participant: quotedParticipant,
          message: quotedMsg
        } : null
      },

      // Methods (to be called on sock instead)
      getChat: async () => {
        if (isGroup) {
          return await this.sock.groupMetadata(chatId);
        }
        return null;
      },

      getQuotedMessage: async () => {
        if (!quotedMsg) return null;
        return {
          id: { _serialized: quotedStanzaId, id: quotedStanzaId },
          body: quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '',
          author: quotedParticipant,
          from: chatId,
          hasMedia: !!(quotedMsg.imageMessage || quotedMsg.videoMessage),
          type: getContentType(quotedMsg) || 'text',
          delete: async (forEveryone: boolean) => {
            if (forEveryone && quotedStanzaId) {
              await this.sock.sendMessage(chatId, {
                delete: {
                  remoteJid: chatId,
                  fromMe: false,
                  id: quotedStanzaId,
                  participant: quotedParticipant
                }
              });
            }
          }
        };
      },

      react: async (emoji: string) => {
        await this.sock.sendMessage(chatId, {
          react: { text: emoji, key: msg.key }
        });
      },

      delete: async (forEveryone: boolean) => {
        if (forEveryone) {
          await this.sock.sendMessage(chatId, { delete: msg.key });
        }
      },

      getContact: async () => {
        return {
          id: { _serialized: senderJid, user: userPhone },
          pushname: msg.pushName,
          number: userPhone,
          name: msg.pushName
        };
      }
    };
  }

  /**
   * Handle group participant updates
   */
  async handleGroupParticipantsUpdate(update: { id: string; participants: string[]; action: string }) {
    try {
      logger.info(`👥 Group Participants Update: action=${update.action} in ${update.id}`);
      const { id: groupJid, participants, action } = update;
      const groupId = normalizeGroupId(groupJid);

      const group = await GroupRepository.getById(groupId);

      if (!group) {
        logger.warn(`⚠️ Group not found in DB for update: ${groupId}`);
        return;
      }

      if (!group.isActive) {
        logger.info(`ℹ️ Group ${groupId} is not active, ignoring participant update`);
        return;
      }

      for (const participantJid of participants) {
        const phone = this.jidToPhone(participantJid);

        if (action === 'add') {
          if (phone) {
            logger.info(`👤 Member joined: ${phone} in group ${groupId}`);
            await this.handleMemberJoin(groupId, phone, participantJid);
          }
        } else if (action === 'remove') {
          if (phone) {
            logger.info(`👤 Member left: ${phone} in group ${groupId}`);
            await this.handleMemberLeave(groupId, phone);
          }
        } else if (action === 'promote') {
          if (phone) {
            logger.info(`👤 Member promoted to admin: ${phone} in group ${groupId}`);
            // Could update member role in DB here
          }
        } else if (action === 'demote') {
          if (phone) {
            logger.info(`👤 Member demoted from admin: ${phone} in group ${groupId}`);
            // Could update member role in DB here
          }
        }
      }
    } catch (error) {
      logger.error('Error al manejar cambio de participantes:', error);
    }
  }

  /**
   * ALGORITMO DE RECONCILIACIÓN DE IDENTIDAD ASÍNCRONA (ARIA)
   * 
   * Based on the technical report about Baileys Multi-Device architecture:
   * - group-participants.update only provides JID (often a LID), not name
   * - Names come from store.contacts (populated via contacts.update or messages.upsert)
   * - LIDs can be resolved via sock.signalRepository.lidMapping
   * - Profile pics may return 401/403/404 due to privacy settings
   * 
   * The algorithm prioritizes graceful degradation over blocking for unavailable data.
   */
  async handleMemberJoin(groupId: string, phone: string, participantJid: string) {
    // Import contactStore to lookup cached names
    const { contactStore } = await import('./whatsapp-client.js');

    try {
      // ==================== FASE 0: DEDUPLICACIÓN ==================== 
      const welcomeKey = `${groupId}_${phone}_welcome`;
      const now = Date.now();
      const lastWelcome = this.processedWelcomes.get(welcomeKey);

      if (lastWelcome && (now - lastWelcome < 60 * 1000)) {
        logger.info(`🚫 Bienvenida duplicada ignorada para ${phone} en ${groupId}`);
        return;
      }
      this.processedWelcomes.set(welcomeKey, now);

      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      const groupJid = `${groupId}@g.us`;

      // ==================== FASE 1: NORMALIZACIÓN Y DETECCIÓN LID ==================== 
      const isRealPhone = (num: string): boolean => {
        const clean = num.replace(/\D/g, '');
        // Real phones: 10-13 digits. LIDs: 14-17 digits
        return /^\d{10,13}$/.test(clean);
      };

      let realPhone = phone;
      let displayName: string | null = null;
      let memberCount = 0;
      let profilePicUrl: string | null = null;
      let isLID = participantJid.includes('@lid') || !isRealPhone(phone);

      logger.info(`👤 [ARIA] Processing: jid=${participantJid}, phone=${phone}, isLID=${isLID}`);

      // ==================== FASE 1.5: INDICADOR DE ESCRITURA ==================== 
      try {
        await this.sock.sendPresenceUpdate('composing', groupJid);
        logger.info(`⌨️ Typing indicator sent`);
      } catch (e) { }

      // ==================== FASE 2: RESOLUCIÓN DE IDENTIDAD (STORE + LID MAPPING) ==================== 

      // Step 2.1: Check contactStore for cached name
      displayName = contactStore?.getName(participantJid) || null;

      if (displayName) {
        logger.info(`📒 [ARIA] Name from store: "${displayName}"`);
      }

      // Step 2.2: If LID, try to resolve via lidMapping
      if (isLID) {
        try {
          // Try lidMapping.getPNForLID if available
          const lidMapping = (this.sock as any).signalRepository?.lidMapping;
          if (lidMapping && typeof lidMapping.getPNForLID === 'function') {
            const pnJid = await lidMapping.getPNForLID(participantJid);
            if (pnJid) {
              const pnNumber = pnJid.split('@')[0].split(':')[0];
              if (isRealPhone(pnNumber)) {
                realPhone = pnNumber;
                isLID = false;
                logger.info(`📱 [ARIA] LID resolved via lidMapping: ${phone} -> ${realPhone}`);

                // Also check contactStore for this PN
                if (!displayName) {
                  displayName = contactStore?.getName(pnJid) || null;
                }
              }
            }
          }
        } catch (e: any) {
          logger.debug(`[ARIA] lidMapping check failed: ${e.message}`);
        }
      }

      // Step 2.3: Wait for Baileys to sync contact data
      logger.info(`⏳ [ARIA] Waiting 4s for contact sync...`);
      await sleep(4000);

      // Step 2.4: Re-check contactStore after waiting
      if (!displayName) {
        displayName = contactStore?.getName(participantJid) || null;
        if (displayName) {
          logger.info(`📒 [ARIA] Name from store (after wait): "${displayName}"`);
        }
      }

      // ==================== FASE 3: ENRIQUECIMIENTO (METADATA + FOTO) ==================== 

      // Step 3.1: Get group metadata for member count and potential phone resolution
      try {
        const metadata = await this.sock.groupMetadata(groupJid);
        memberCount = metadata.participants.length;

        // Search for participant with a REAL phone number
        for (const p of metadata.participants) {
          const pNumber = p.id.split('@')[0].split(':')[0];

          if (p.id === participantJid || p.id.includes(phone)) {
            if (isRealPhone(pNumber)) {
              realPhone = pNumber;
              isLID = false;
              logger.info(`📱 [ARIA] Found real phone in metadata: ${phone} -> ${realPhone}`);
              break;
            }
          }
        }

        // Heuristic: match last 4 digits if still LID
        if (isLID) {
          const lidLast4 = phone.slice(-4);
          for (const p of metadata.participants) {
            const pNumber = p.id.split('@')[0].split(':')[0];
            if (isRealPhone(pNumber) && pNumber.endsWith(lidLast4)) {
              realPhone = pNumber;
              isLID = false;
              logger.info(`📱 [ARIA] Matched by last 4 digits: ${phone} -> ${realPhone}`);
              break;
            }
          }
        }
      } catch (e: any) {
        logger.warn(`⚠️ [ARIA] Could not get group metadata: ${e.message}`);
      }

      // Step 3.2: Validate phone with onWhatsApp
      if (!isLID && isRealPhone(realPhone)) {
        try {
          const [result] = await this.sock.onWhatsApp(`${realPhone}@s.whatsapp.net`);
          if (result && result.exists) {
            logger.info(`📱 [ARIA] onWhatsApp confirmed: ${realPhone}`);
          }
        } catch (e) { }
      }

      // Step 3.3: Get profile picture with robust error handling (401/403/404)
      if (!isLID && isRealPhone(realPhone)) {
        for (let i = 0; i < 3 && !profilePicUrl; i++) {
          try {
            profilePicUrl = await this.sock.profilePictureUrl(`${realPhone}@s.whatsapp.net`, 'image');
            if (profilePicUrl) {
              logger.info(`📷 [ARIA] Profile pic found on attempt ${i + 1}`);
              break;
            }
          } catch (e: any) {
            const statusCode = e?.output?.statusCode || e?.data?.statusCode;
            if (statusCode === 401 || statusCode === 403) {
              logger.debug(`📷 [ARIA] Privacy restricted for ${realPhone}`);
              break; // Don't retry, user has privacy settings
            } else if (statusCode === 404) {
              logger.debug(`📷 [ARIA] No profile pic for ${realPhone}`);
              break; // User has no pic
            }
            if (i < 2) await sleep(1000);
          }
        }
      }

      // ==================== FASE 4: FINALIZACIÓN ==================== 

      // Stop typing indicator
      try {
        await this.sock.sendPresenceUpdate('paused', groupJid);
      } catch (e) { }

      // Determine final display name with graceful fallback
      const finalDisplayName = displayName || (isLID ? 'Nuevo Miembro' : realPhone);

      logger.info(`👋 [ARIA] Sending welcome: phone=${realPhone}, isLID=${isLID}, name="${finalDisplayName}", memberCount=${memberCount}, pic=${profilePicUrl ? 'YES' : 'NO'}`);

      // ==================== FASE 5: ENVÍO DE BIENVENIDA ==================== 
      await WelcomeService.sendWelcomeWithData(
        this.sock,
        groupId,
        realPhone,
        finalDisplayName,
        memberCount,
        profilePicUrl
      );
    } catch (error) {
      logger.error(`[ARIA] Error al manejar ingreso de miembro:`, error);
    }
  }

  /**
   * Handle member leave
   */
  async handleMemberLeave(groupId: string, phone: string, wasKicked = false) {
    try {
      const member = await MemberService.getMemberInfo(groupId, phone);

      // Log exit
      const { WarningService } = await import('../services/WarningService.js');
      await WarningService.logExit(groupId, phone, wasKicked);

      if (member) {
        await MemberService.removeMember(groupId, phone);

        // Fetch updated member count
        let count = 0;
        try {
          // Use metadata if available (most accurate)
          const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
          const metadata = await this.sock.groupMetadata(targetJid);
          count = metadata.participants.length;
        } catch (e) {
          // Fallback to DB count
          const members = await MemberRepository.getActiveMembers(groupId);
          count = members.length;
        }

        await WelcomeService.sendGoodbye(this.sock, groupId, phone, member.displayName, count);
      }

      logger.info(`👋 Member exit logged: ${phone} from group ${groupId}`);
    } catch (error) {
      logger.error(`Error al manejar salida de miembro:`, error);
    }
  }

  /**
   * Handle group metadata updates
   */
  async handleGroupUpdate(update: any) {
    try {
      const groupJid = update.id;
      if (!groupJid) return;

      const groupId = normalizeGroupId(groupJid);
      logger.info(`[GROUP_UPDATE] Grupo ${groupId} actualizado`);

      const metadata = await this.sock.groupMetadata(groupJid);

      await GroupRepository.update(groupId, {
        name: metadata.subject,
        description: metadata.desc || '',
        restrict: metadata.restrict || false,
        announce: metadata.announce || false,
        updatedAt: new Date().toISOString()
      });

      logger.info(`[GROUP_UPDATE] Metadatos actualizados para grupo ${groupId}`);
    } catch (error) {
      logger.error(`[GROUP_UPDATE] Error al actualizar grupo:`, error);
    }
  }

  /**
   * Handle contact updates
   */
  async handleContactUpdate(update: any) {
    try {
      const contactId = update.id;
      if (!contactId) return;

      const phone = this.jidToPhone(contactId);
      if (!phone) return;

      logger.info(`[CONTACT_CHANGED] Contacto ${phone} actualizado`);
      // Could update member info across groups here
    } catch (error) {
      logger.error(`[CONTACT_CHANGED] Error al actualizar contacto:`, error);
    }
  }
}

export default EventHandler;
