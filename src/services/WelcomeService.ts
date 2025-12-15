import GroupRepository from '../repositories/GroupRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import WelcomeImageService, { welcomeImageService } from './WelcomeImageService.js';
import { replacePlaceholders } from '../utils/formatter.js';
import { config as envConfig } from '../config/environment.js';
import { readFileSync } from 'fs';
import { normalizePhone, phoneToJid } from '../utils/phone.js';
import { resolveLidToPhone, forceLoadContactData } from '../utils/lid-resolver.js';
import logger from '../lib/logger.js';
import pkg from 'whatsapp-web.js';
const { MessageMedia } = pkg;

export class WelcomeService {
  /**
   * Envía mensaje de bienvenida con mención real cliqueable
   * 
   * FLUJO MEJORADO (Dic 2025):
   * 1. Resuelve LIDs a teléfonos reales usando resolveLidToPhone.
   * 2. Fuerza la carga de metadatos (nombre/foto) usando forceLoadContactData.
   * 3. Genera la imagen y envía el mensaje con el nombre correcto.
   */
  static async sendWelcome(sock, groupId, phone, displayName, memberCount = null, contactObject = null) {
    const sleep = (ms) => new Promise(res => setTimeout(res, ms));

    try {
      logger.info(`👋 Processing welcome for ${phone} in ${groupId}`);

      // ============================================================
      // ESTRATEGIA: "Hydration-Wait-Retry" con Presencia
      // ============================================================

      const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
      let chat = null;
      try {
        chat = await sock.getChatById(targetJid);
      } catch (e) {
        logger.warn(`Could not get chat object for ${targetJid}: ${e.message}`);
      }

      // ============================================================
      // ESTRATEGIA MEJORADA: "Typing-Wait-Retry" con tiempo extendido (6s)
      // Enviamos múltiples ciclos de "Escribiendo" para forzar la
      // sincronización de metadatos (nombre y foto) en grupos grandes
      // ============================================================
      const TYPING_CYCLES = 3;
      const TYPING_DURATION_MS = 2000; // 2s por ciclo = 6s total

      for (let cycle = 0; cycle < TYPING_CYCLES; cycle++) {
        if (chat) {
          try { await chat.sendStateTyping(); } catch (e) { }
        }
        await sleep(TYPING_DURATION_MS);
      }

      if (chat) {
        try { await chat.clearState(); } catch (e) { }
      }

      const groupConfig = await GroupRepository.getConfig(groupId);

      if (!groupConfig?.welcome?.enabled) {
        logger.info(`ℹ️ Welcome disabled for group ${groupId}`);
        return null;
      }

      const group = await GroupRepository.getById(groupId);

      // Obtener conteo de miembros
      let count = memberCount;
      if (!count) {
        const members = await MemberRepository.getActiveMembers(groupId);
        count = members.length;
      }

      const isLid = phone.includes('@lid');
      const waId = isLid ? phone : (phone.includes('@') ? phone : `${phone}@c.us`);

      // ============================================================
      // PASO 1: Determinar el JID real para la mención
      // ============================================================

      let finalMentionJid = waId;

      // Si es LID, intentar resolver al número real usando la utilidad robusta
      if (isLid) {
        const resolvedPhone = await resolveLidToPhone(sock, groupId, waId);
        if (resolvedPhone) {
          finalMentionJid = resolvedPhone.includes('@') ? resolvedPhone : `${resolvedPhone}@c.us`;
          logger.info(`✅ LID ${waId} resuelto a ${finalMentionJid} para bienvenida`);
        }
      }

      // Extraer el número limpio para el texto de la mención
      let cleanNumberForText;
      if (finalMentionJid.includes('@lid')) {
        cleanNumberForText = finalMentionJid.replace('@lid', '').split(':')[0];
      } else {
        cleanNumberForText = finalMentionJid.replace('@c.us', '').replace('@s.whatsapp.net', '');
      }

      const userMentionText = `@${cleanNumberForText}`;

      // ============================================================
      // PASO 2: Obtener el NOMBRE REAL (Pushname)
      // Usamos forceLoadContactData para garantizar datos frescos
      // ============================================================

      let nameForDisplay: string | null = null;

      // Usar la utilidad de hidratación forzada (simula interacción UI)
      const hydratedData = await forceLoadContactData(sock, finalMentionJid, groupId);
      if (hydratedData && hydratedData.name) {
        nameForDisplay = hydratedData.name;
        logger.info(`✅ [Welcome] Nombre obtenido vía forceLoadContactData: "${nameForDisplay}"`);
      }

      // Fallback 1: DisplayName proporcionado
      if (!nameForDisplay && displayName && displayName !== 'Usuario' && displayName !== 'Unknown' && displayName !== 'undefined') {
        nameForDisplay = displayName;
      }

      // Fallback 2: Objeto de contacto directo
      if (!nameForDisplay && contactObject) {
        const contactName = contactObject.pushname || contactObject.name || contactObject.shortName;
        if (contactName && contactName !== 'undefined' && contactName !== 'Usuario') {
          nameForDisplay = contactName;
        }
      }

      // Fallback Final: Número de teléfono (nunca "Usuario" o "undefined")
      if (!nameForDisplay || nameForDisplay === 'Usuario' || nameForDisplay === 'undefined' || nameForDisplay === 'Unknown') {
        nameForDisplay = cleanNumberForText;
        logger.info(`📱 [Welcome] Usando número de teléfono como nombre: "${nameForDisplay}"`);
      }

      logger.info(`📝 Datos finales: JID=${finalMentionJid}, mention=${userMentionText}, nameForDisplay="${nameForDisplay}"`);

      // ============================================================
      // PASO 3: Generar mensaje e imagen
      // ============================================================

      let message = replacePlaceholders(groupConfig.welcome.message, {
        user: userMentionText,
        name: nameForDisplay,
        group: group?.name || 'el grupo',
        count: count
      });

      if (!message || message.trim() === '') {
        message = `¡Bienvenido ${userMentionText} al grupo!`;
      }

      const mentions = [finalMentionJid];
      let imageBuffer: Buffer | null = null;

      if (envConfig.features?.welcomeImages && groupConfig.features?.welcomeImages !== false) {
        try {
          if (envConfig.cloudinary?.welcomeBgUrl) {
            imageBuffer = await welcomeImageService.createWelcomeImage(
              waId,           // ID original para buscar foto
              nameForDisplay, // Nombre correcto para la imagen
              sock
            );
          }
        } catch (error) {
          logger.error(`Error generating welcome image:`, error);
        }
      }

      // ============================================================
      // PASO 4: Enviar
      // ============================================================

      if (imageBuffer) {
        try {
          const base64Image = imageBuffer.toString('base64');
          const media = new MessageMedia('image/png', base64Image, 'welcome.png');

          await sock.sendMessage(targetJid, media, {
            caption: message,
            mentions: mentions
          });
          logger.info(`✅ Imagen de bienvenida enviada a "${nameForDisplay}"`);
        } catch (error) {
          logger.warn(`Error al enviar imagen, enviando solo texto:`, error);
          await sock.sendMessage(targetJid, message, { mentions: mentions });
        }
      } else {
        await sock.sendMessage(targetJid, message, { mentions: mentions });
      }

      return message;
    } catch (error) {
      logger.error(`Error al enviar bienvenida:`, error);
      return null;
    }
  }

  /**
   * Envía mensaje de despedida
   */
  static async sendGoodbye(sock, groupId, phone, displayName) {
    try {
      const config = await GroupRepository.getConfig(groupId);

      if (!config?.goodbye?.enabled) {
        return null;
      }

      const group = await GroupRepository.getById(groupId);
      const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;

      const message = replacePlaceholders(config.goodbye.message, {
        name: displayName,
        group: group?.name || 'el grupo'
      });

      await sock.sendMessage(targetJid, {
        text: message
      });

      logger.info(`Despedida enviada a ${displayName} en grupo ${groupId}`);
      return message;
    } catch (error) {
      logger.error(`Error al enviar despedida:`, error);
      return null;
    }
  }
}

export default WelcomeService;
