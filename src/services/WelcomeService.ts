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

      const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
      let chat = null;
      try {
        chat = await sock.getChatById(targetJid);
      } catch (e) {
        logger.warn(`Could not get chat object for ${targetJid}: ${e.message}`);
      }

      // ============================================================
      // PASO 1: Preparar identificadores del usuario
      // ============================================================
      const isLid = phone.includes('@lid');
      const waId = isLid ? phone : (phone.includes('@') ? phone : `${phone}@c.us`);

      let finalMentionJid = waId;

      // Si es LID, resolver al número real
      if (isLid) {
        const resolvedPhone = await resolveLidToPhone(sock, groupId, waId);
        if (resolvedPhone) {
          finalMentionJid = resolvedPhone.includes('@') ? resolvedPhone : `${resolvedPhone}@c.us`;
          logger.info(`✅ LID ${waId} resuelto a ${finalMentionJid} para bienvenida`);
        }
      }

      // Obtener nombre del grupo para el DM
      const group = await GroupRepository.getById(groupId);
      const groupName = group?.name || 'el grupo';

      // ============================================================
      // PASO 2: Enviar DM al usuario que se unió
      // Esto FUERZA a WhatsApp a cargar los metadatos del contacto
      // ============================================================
      const dmJid = finalMentionJid.includes('@') ? finalMentionJid : `${finalMentionJid}@c.us`;
      const dmMessage = `👋 ¡Bienvenido a *${groupName}*!\n\n` +
        `📋 Es importante que leas las reglas del grupo para una mejor convivencia.\n\n` +
        `¡Esperamos que disfrutes tu estadía!`;

      try {
        await sock.sendMessage(dmJid, dmMessage);
        logger.info(`📨 DM de bienvenida enviado a ${dmJid}`);
      } catch (dmError: any) {
        // El DM puede fallar si el usuario tiene privacidad estricta
        // Continuamos con el proceso normal
        logger.warn(`⚠️ No se pudo enviar DM a ${dmJid}: ${dmError.message}`);
      }

      // ============================================================
      // PASO 3: Ciclo de "Escribiendo..." simplificado (2 ciclos)
      // Escribiendo 2s → Pausa 2s → Escribiendo 2s
      // Durante este tiempo WhatsApp sincroniza los datos del usuario
      // ============================================================
      const TYPING_CYCLES = 2;
      const TYPING_DURATION_MS = 2000;
      const PAUSE_DURATION_MS = 2000;

      // Iniciar carga de datos en paralelo
      const dataLoadPromise = (async () => {
        let name: string | null = null;

        // Esperar un momento para que el DM haya forzado la carga
        await sleep(500);

        // Estrategia 1: forceLoadContactData (fuerza carga vía Puppeteer)
        const hydratedData = await forceLoadContactData(sock, finalMentionJid, groupId);
        if (hydratedData?.name && hydratedData.name !== 'undefined' && hydratedData.name !== 'Usuario') {
          name = hydratedData.name;
          logger.info(`✅ [Welcome Async] Nombre obtenido vía forceLoadContactData: "${name}"`);
        }

        // Estrategia 2: displayName proporcionado
        if (!name && displayName && displayName !== 'Usuario' && displayName !== 'Unknown' && displayName !== 'undefined') {
          name = displayName;
          logger.info(`✅ [Welcome Async] Nombre obtenido vía displayName: "${name}"`);
        }

        // Estrategia 3: contactObject
        if (!name && contactObject) {
          const contactName = contactObject.pushname || contactObject.name || contactObject.shortName;
          if (contactName && contactName !== 'undefined' && contactName !== 'Usuario') {
            name = contactName;
            logger.info(`✅ [Welcome Async] Nombre obtenido vía contactObject: "${name}"`);
          }
        }

        return name;
      })();

      // Ejecutar ciclos de typing
      for (let cycle = 0; cycle < TYPING_CYCLES; cycle++) {
        logger.debug(`📝 Typing cycle ${cycle + 1}/${TYPING_CYCLES}`);

        if (chat) {
          try { await chat.sendStateTyping(); } catch (e) { }
        }
        await sleep(TYPING_DURATION_MS);

        // Pausa intermedia
        if (cycle < TYPING_CYCLES - 1) {
          if (chat) {
            try { await chat.clearState(); } catch (e) { }
          }
          await sleep(PAUSE_DURATION_MS);
        }
      }

      // Limpiar estado al final
      if (chat) {
        try { await chat.clearState(); } catch (e) { }
      }

      // ============================================================
      // PASO 4: Verificar configuración
      // ============================================================
      const groupConfig = await GroupRepository.getConfig(groupId);

      if (!groupConfig?.welcome?.enabled) {
        logger.info(`ℹ️ Welcome disabled for group ${groupId}`);
        return null;
      }

      let count = memberCount;
      if (!count) {
        const members = await MemberRepository.getActiveMembers(groupId);
        count = members.length;
      }

      // ============================================================
      // PASO 5: Obtener datos cargados
      // ============================================================
      let nameForDisplay = await dataLoadPromise;

      // Fallback: extraer número limpio si no hay nombre
      let cleanNumberForText;
      if (finalMentionJid.includes('@lid')) {
        cleanNumberForText = finalMentionJid.replace('@lid', '').split(':')[0];
      } else {
        cleanNumberForText = finalMentionJid.replace('@c.us', '').replace('@s.whatsapp.net', '');
      }

      if (!nameForDisplay || nameForDisplay === 'Usuario' || nameForDisplay === 'undefined' || nameForDisplay === 'Unknown') {
        nameForDisplay = cleanNumberForText;
        logger.info(`📱 [Welcome] Usando número de teléfono como nombre: "${nameForDisplay}"`);
      }

      // ============================================================
      // PASO 6: Construir mención con NOMBRE
      // ============================================================
      const userMentionText = `@${nameForDisplay}`;

      logger.info(`📝 Datos finales: JID=${finalMentionJid}, mention=${userMentionText}, nameForDisplay="${nameForDisplay}"`);

      // ============================================================
      // PASO 7: Generar mensaje e imagen
      // ============================================================
      let message = replacePlaceholders(groupConfig.welcome.message, {
        user: userMentionText,
        usuario: userMentionText,
        name: nameForDisplay,
        nombre: nameForDisplay,
        group: groupName,
        grupo: groupName,
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
              waId,
              nameForDisplay,
              sock
            );
          }
        } catch (error) {
          logger.error(`Error generating welcome image:`, error);
        }
      }

      // ============================================================
      // PASO 8: Enviar mensaje de bienvenida al grupo
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
