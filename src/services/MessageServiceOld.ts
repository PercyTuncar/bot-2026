import MessageRepository from '../repositories/MessageRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import GroupRepository from '../repositories/GroupRepository.js';
import { getNow } from '../utils/time.js';
import { normalizePhone, normalizeGroupId, getUserPhoneFromMessage, getDisplayNameFromMessage } from '../utils/phone.js';
import { isValidMessageForPoints } from '../utils/validator.js';
import { config } from '../config/environment.js';
import logger from '../lib/logger.js';
import { getFirestore } from '../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

// const db = getFirestore();

export class MessageService {
  /**
   * Guarda un mensaje (optimizado para reducir escrituras)
   */
  static async saveMessage(groupId, msg, isCommand = false) {
    try {
      groupId = normalizeGroupId(groupId);

      // CHECK GROUP ACTIVE STATUS
      if (groupId) {
        const group = await GroupRepository.getById(groupId);
        if (group && !group.isActive && !isCommand) {
          logger.info(`🚫 Message not saved. Group ${groupId} is inactive.`);
          return { saved: false, reason: 'group_inactive' };
        }
      }

      // Usar msg.to como chat real (más confiable que msg.from con LIDs)
      const remoteJid = msg.to || msg.from;
      if (!remoteJid) return false;

      const isGroup = remoteJid.endsWith('@g.us');

      // Usar la nueva función para extraer el número real (maneja LIDs correctamente)
      const phone = getUserPhoneFromMessage(msg, isGroup);
      
      if (!phone || phone.includes('@') || phone.includes(':')) {
        logger.warn(`⚠️ No se pudo extraer número válido del mensaje. remoteJid: ${remoteJid}`);
        return false;
      }

      const text = msg.body || '';
      
      // Usar la nueva función para extraer el displayName real
      const displayName = getDisplayNameFromMessage(msg, phone);

      // AUTO-REGISTRATION CHECK
      // If member doesn't exist, create it on the fly to prevent crashes
      try {
        const memberExists = await MemberRepository.getByPhone(groupId, phone);
        if (!memberExists) {
          logger.info(`👤 Auto-registering missing member: ${phone} in group ${groupId}`);
          const now = getNow();
          await MemberRepository.save(groupId, {
            phone,
            displayName,
            isMember: true,
            role: 'member',
            // Sistema de puntos
            points: 0,
            messageCount: 0,
            totalMessagesCount: 0,
            currentLevel: 1,
            messagesForNextPoint: 0,
            // Sistema de moderación
            warnings: 0,
            warnHistory: [],
            // Historial temporal
            createdAt: now,
            joinedAt: now,
            leftAt: null,
            lastMessageAt: null,
            updatedAt: now,
            // Estadísticas (SPEC Section 3.2)
            stats: {
              totalPointsEarned: 0,
              totalPointsSpent: 0,
              totalRewardsRedeemed: 0,
              firstMessageDate: now,
              averageMessagesPerDay: 0
            }
          });
        }
      } catch (regError) {
        logger.warn(`⚠️ Auto-registration failed for ${phone}:`, regError);
        // Continue anyway, maybe the next update will fix it via upsert
      }

      if (!config.messages.saveEnabled && !isCommand && !config.messages.saveOnlyCommands) {
        await MemberRepository.update(groupId, phone, {
          lastMessageAt: getNow(),
          displayName: displayName
        });
        return { saved: false, reason: 'message_saving_disabled' };
      }

      if (config.messages.saveOnlyCommands && !isCommand) {
        await MemberRepository.update(groupId, phone, {
          lastMessageAt: getNow(),
          displayName: displayName
        });
        return { saved: false, reason: 'only_commands_saved' };
      }

      let mentions = [];
      const mentionedJids = msg.mentionedJidList || [];

      // 1. Try standard list from library
      if (mentionedJids.length > 0) {
        try {
          const mentionPromises = mentionedJids.map(async (jid) => {
            const mentionPhone = normalizePhone(jid);
            if (!mentionPhone) return null;
            const member = await MemberRepository.getByPhone(groupId, mentionPhone);
            return {
              jid,
              phone: mentionPhone,
              displayName: member?.displayName || mentionPhone,
              role: member?.role || 'unknown'
            };
          });
          const results = await Promise.all(mentionPromises);
          mentions = results.filter(Boolean);
        } catch (error) {
          logger.warn(`Error resolving mentions for message:`, error);
        }
      }

      // 2. Fallback: Regex extraction from text if empty
      if (mentions.length === 0 && text.includes('@')) {
        try {
          // Regex to capture @123456...
          const matches = text.match(/@(\d+)/g);
          if (matches && matches.length > 0) {
            logger.info(`🔍 Regex found potential mentions: ${matches.join(', ')}`);
            const mentionPromises = matches.map(async (match) => {
              const rawPhone = match.substring(1); // remove @
              const mentionPhone = normalizePhone(rawPhone);
              if (!mentionPhone) return null;

              // Verify member exists to be sure it's a real mention
              const member = await MemberRepository.getByPhone(groupId, mentionPhone);
              if (!member) {
                // Optional: Auto-create if we want to be super aggressive, 
                // but better to only mention if they exist to avoid spamming fake numbers
                // OR fallback to just saving the number
                return {
                  jid: `${mentionPhone}@s.whatsapp.net`,
                  phone: mentionPhone,
                  displayName: mentionPhone,
                  role: 'unknown'
                }
              }

              return {
                jid: `${mentionPhone}@s.whatsapp.net`, // Best guess
                phone: mentionPhone,
                displayName: member.displayName || mentionPhone,
                role: member.role || 'unknown'
              };
            });
            const results = await Promise.all(mentionPromises);
            mentions = results.filter(Boolean);
            // Deduplicate
            mentions = [...new Map(mentions.map(m => [m.phone, m])).values()];
          }
        } catch (error) {
          logger.warn(`Error parsing regex mentions:`, error);
        }
      }

      // Extract message type
      const messageType = msg.type || 'chat';
      const hasMedia = msg.hasMedia || false;
      const isForwarded = msg.isForwarded || false;
      
      // Extract mentioned numbers (only phone numbers)
      const mentionedNumbers = mentions.map(m => m.phone);

      // SPEC-compliant message structure (Section 3.3)
      const messageData = {
        messageId: msg.id?.id || msg.id?._serialized || `${Date.now()}_${phone}`,
        // Author
        authorPhone: phone,
        authorName: displayName,
        authorRole: 'member', // Will be updated if we fetch member
        // Content
        body: text,
        type: messageType,
        hasMedia,
        isForwarded,
        mentionedNumbers,
        // Timestamp
        timestamp: getNow(),
        // Moderation
        wasDeleted: false,
        deletionReason: null,
        triggeredWarn: false,
        // Points
        contributedToPoints: !isCommand
      };

      await MessageRepository.save(groupId, messageData);

      if (!isCommand) {
        logger.info(`💾 Mensaje guardado en ${groupId}: ${phone} dijo "${text.substring(0, 20)}..." (Mentions: ${mentions.length})`);
      }

      // Update member's last message info AND increment total message count atomically
      await MemberRepository.update(groupId, phone, {
        lastMessageAt: getNow(),
        displayName: displayName,
        messageCount: FieldValue.increment(1)
      });

      // NOTE: Points accumulation is handled by PointsService.processMessage() 
      // which is called by EventHandler immediately after this.

      return messageData;
    } catch (error) {
      logger.error(`Error al guardar mensaje:`, error);
      throw error;
    }
  }

  static async savePrivateMessage(phone, msg, isCommand = false) {
    try {
      const normalized = normalizePhone(phone);
      const text = msg.body || '';
      const displayName = msg.pushName || normalized;
      const db = getFirestore(); // Lazy init
      const messageRef = db.collection('private_messages').doc();

      await messageRef.set({
        phone: normalized,
        displayName,
        text,
        length: text.length,
        isCommand,
        processed: false,
        timestamp: getNow(),
        createdAt: getNow()
      });

      return { id: messageRef.id, phone: normalized, text, isCommand };
    } catch (error) {
      logger.error(`Error al guardar mensaje privado:`, error);
      throw error;
    }
  }
}

export default MessageService;
