import GroupRepository from '../repositories/GroupRepository.js';
import WarningService from './WarningService.js';
import { normalizePhone } from '../utils/phone.js';
import logger from '../lib/logger.js';

export class ModerationService {
  /**
   * Verifica si un mensaje contiene palabras prohibidas
   */
  static async checkBannedWords(groupId, messageText, config) {
    if (!config?.bannedWords?.enabled || !config.bannedWords.words || config.bannedWords.words.length === 0) {
      return { violation: false };
    }

    const text = messageText.toLowerCase();
    const bannedWords = config.bannedWords.words.map(w => w.toLowerCase());

    for (const word of bannedWords) {
      if (text.includes(word)) {
        return {
          violation: true,
          type: 'banned_word',
          word,
          action: config.bannedWords.action || 'warn'
        };
      }
    }

    return { violation: false };
  }

  /**
   * Verifica si un mensaje contiene links no permitidos
   */
  static async checkAntiLink(groupId, messageText, config) {
    if (!config?.antiLink?.enabled) {
      return { violation: false };
    }

    // Regex para detectar URLs
    const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|net|org|edu|gov|mil|int|info|biz|name|museum|coop|aero|[a-z]{2})[^\s]*)/gi;
    const matches = messageText.match(urlRegex);

    if (!matches) {
      return { violation: false };
    }

    const allowedDomains = config.antiLink.allowedDomains || [];

    for (const url of matches) {
      let isAllowed = false;

      for (const domain of allowedDomains) {
        if (url.includes(domain)) {
          isAllowed = true;
          break;
        }
      }

      if (!isAllowed) {
        return {
          violation: true,
          type: 'link',
          url,
          action: config.antiLink.action || 'delete'
        };
      }
    }

    return { violation: false };
  }

  /**
   * Verifica anti-spam (mensajes muy rápidos)
   */
  static messageTimestamps = new Map();

  static async checkAntiSpam(phone, groupId, config) {
    if (!config?.antiSpam?.enabled) {
      return { violation: false };
    }

    const key = `${groupId}:${phone}`;
    const now = Date.now();
    const timestamps = this.messageTimestamps.get(key) || [];
    
    const maxMessages = config.antiSpam.maxMessages || 5;
    const interval = (config.antiSpam.interval || 10) * 1000; // Convertir a ms

    // Filtrar timestamps dentro del intervalo
    const recentMessages = timestamps.filter(t => now - t < interval);

    if (recentMessages.length >= maxMessages) {
      return {
        violation: true,
        type: 'spam',
        count: recentMessages.length,
        action: 'warn'
      };
    }

    // Agregar timestamp actual
    recentMessages.push(now);
    this.messageTimestamps.set(key, recentMessages.slice(-20)); // Mantener últimos 20

    // Limpiar cache cada 5 minutos
    setTimeout(() => {
      const all = this.messageTimestamps.get(key) || [];
      const cleaned = all.filter(t => Date.now() - t < 300000);
      if (cleaned.length > 0) {
        this.messageTimestamps.set(key, cleaned);
      } else {
        this.messageTimestamps.delete(key);
      }
    }, 300000);

    return { violation: false };
  }

  /**
   * Procesa una violación de moderación
   */
  static async handleViolation(sock, msg, violation, groupId, userPhone) {
    // userPhone ya viene como userId válido (phone o LID) desde event-handler
    const userId = userPhone;

    try {
      // Eliminar mensaje si la acción lo requiere
      if (violation.action === 'delete' || violation.action === 'kick') {
        try {
          await msg.delete(true); // true = eliminar para todos
        } catch (error) {
          logger.warn(`No se pudo eliminar mensaje: ${error.message}`);
        }
      }

      // Advertir usuario si la acción lo requiere
      if (violation.action === 'warn' || violation.action === 'kick') {
        let reason = '';
        if (violation.type === 'banned_word') {
          reason = `Uso de palabra prohibida: "${violation.word}"`;
        } else if (violation.type === 'link') {
          reason = 'Envío de link no permitido';
        } else if (violation.type === 'spam') {
          reason = `Spam detectado (${violation.count} mensajes muy rápido)`;
        }

        const botInfo = sock.info;
        const botPhone = normalizePhone(botInfo?.wid?.user);
        const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;

        await WarningService.addWarning(groupId, userId, botPhone, 'Sistema de Moderación', reason);

        await sock.sendMessage(targetJid,
          `⚠️ @${userId} ha recibido una advertencia automática\n\nMotivo: ${reason}`,
          { mentions: [userId + '@s.whatsapp.net'] }
        );
      }

      // Expulsar si es necesario
      if (violation.action === 'kick') {
        try {
          const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
          const chat = await sock.getChatById(targetJid);
          await chat.removeParticipants([userId + '@s.whatsapp.net']);
          
          await sock.sendMessage(targetJid,
            `❌ @${userId} ha sido expulsado por moderación automática`,
            { mentions: [userId + '@s.whatsapp.net'] }
          );
        } catch (error) {
          logger.error(`Error al expulsar usuario: ${error.message}`);
        }
      }

      logger.info(`Violación de moderación procesada: ${violation.type} - Usuario: ${userId}`);
    } catch (error) {
      logger.error('Error al procesar violación de moderación:', error);
    }
  }
}

export default ModerationService;
