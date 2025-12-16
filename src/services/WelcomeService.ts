import GroupRepository from '../repositories/GroupRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import WelcomeImageService, { welcomeImageService } from './WelcomeImageService.js';
import { replacePlaceholders } from '../utils/formatter.js';
import { config as envConfig } from '../config/environment.js';
import { normalizePhone, phoneToJid, getCanonicalId } from '../utils/phone.js';
import logger from '../lib/logger.js';

export class WelcomeService {
  /**
   * Envía mensaje de bienvenida con mención real cliqueable
   * BAILEYS VERSION - usando Buffer para media en lugar de MessageMedia
   */
  static async sendWelcome(sock: any, groupId: string, phone: string, displayName: string | null, memberCount: number | null = null, contactObject: any = null) {
    const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

    try {
      logger.info(`👋 Processing welcome for ${phone} in ${groupId}`);

      const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;

      // Get group metadata for member count if not provided
      let count = memberCount;
      if (!count) {
        try {
          const metadata = await sock.groupMetadata(targetJid);
          count = metadata.participants.length;
        } catch (e) {
          const members = await MemberRepository.getActiveMembers(groupId);
          count = members.length;
        }
      }

      // CRITICAL: Clean phone number - remove all non-numeric chars for proper mention
      const cleanNumber = phone
        .replace('@s.whatsapp.net', '')
        .replace('@c.us', '')
        .replace('@lid', '')
        .split(':')[0]
        .replace(/\D/g, ''); // Remove any non-digit characters

      // Prepare JIDs - always use s.whatsapp.net for mentions
      const userJid = `${cleanNumber}@s.whatsapp.net`;

      logger.info(`👋 JID prepared: phone="${phone}" -> cleanNumber="${cleanNumber}" -> userJid="${userJid}"`);

      // Get group name
      const group = await GroupRepository.getById(groupId);
      const groupName = group?.name || 'el grupo';

      // Send typing indicator
      try {
        await sock.sendPresenceUpdate('composing', targetJid);
      } catch (e) { }

      // Try to send DM with promotional image (optional)
      const dmJid = userJid;
      const dmImageUrl = 'https://res.cloudinary.com/dz1qivt7m/image/upload/v1765843159/anuncio_oficial_ultra_peru_PRECIOS-min_cuycvk.png';
      const dmMessage = `¡Hola! Bienvenido a *RaveHub* 👋👽

Te cuento que *ya puedes adquirir tus entradas* para el **Ultra Perú** directamente con nosotros. 🔥

Lo mejor de esta etapa Early Bird:
✅ Puedes reservar tu entrada *desde hoy con solo S/. 50*.
✅ Tienes la opción de pagar el resto en **3 cuotas mensuales**.

⚠️ _Por favor, no olvides leer las reglas del grupo para una mejor convivencia._`;

      try {
        // Download promotional image with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const dmImageRes = await fetch(dmImageUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (dmImageRes.ok) {
          const dmImageBuffer = Buffer.from(await dmImageRes.arrayBuffer());
          await sock.sendMessage(dmJid, {
            image: dmImageBuffer,
            caption: dmMessage
          });
          logger.info(`📨 DM con imagen enviado a ${dmJid}`);
        } else {
          // Fallback: text only
          await sock.sendMessage(dmJid, { text: dmMessage });
          logger.info(`📨 DM (solo texto) enviado a ${dmJid}`);
        }
      } catch (e: any) {
        // Try text-only if image fails
        try {
          await sock.sendMessage(dmJid, { text: dmMessage });
          logger.info(`📨 DM (fallback texto) enviado a ${dmJid}`);
        } catch (e2: any) {
          logger.warn(`⚠️ Error enviando DM a ${dmJid}: ${e2.message}`);
        }
      }

      // Get name for display (use provided or fallback to phone)
      let nameForDisplay = displayName;

      // Helper for name validation
      const isValidName = (n: any) => {
        if (!n || typeof n !== 'string') return false;
        const t = n.trim();
        if (/^\d{10,}$/.test(t)) return false;
        return t.length > 0 && t !== 'undefined' && t !== 'null' && t !== 'Unknown' && t !== 'Usuario';
      };

      if (!nameForDisplay || !isValidName(nameForDisplay)) {
        nameForDisplay = cleanNumber;
      }

      // Try to get profile picture with timeout
      let profilePicUrl: string | null = null;
      try {
        profilePicUrl = await Promise.race([
          sock.profilePictureUrl(userJid, 'image'),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ]);
      } catch (e) {
        // No profile pic available or timeout
      }

      // Stop typing
      try {
        await sock.sendPresenceUpdate('paused', targetJid);
      } catch (e) { }

      // Check config
      const groupConfig = await GroupRepository.getConfig(groupId);
      if (!groupConfig?.welcome?.enabled) return null;

      // CRITICAL: Build mention text - must be @NUMBER without + or spaces
      // This must match the number part of the JID exactly
      const userMentionText = `@${cleanNumber}`;

      logger.info(`👋 Mention format: userMentionText="${userMentionText}", userJid="${userJid}"`);

      // Build message - replace placeholders
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

      // CRITICAL: mentions array must contain the full JID
      const mentions = [userJid];

      logger.info(`👋 Welcome message: "${message.substring(0, 50)}...", mentions=[${mentions.join(', ')}]`);

      // Generate welcome image
      let imageBuffer: Buffer | null = null;
      if (envConfig.features?.welcomeImages && groupConfig.features?.welcomeImages !== false) {
        try {
          if (envConfig.cloudinary?.welcomeBgUrl) {
            logger.info(`🖼️ Generating welcome image for ${nameForDisplay}`);

            // Pass profile pic URL (or null for Multiavatar fallback)
            imageBuffer = await welcomeImageService.createWelcomeImageWithPhoto(
              cleanNumber,
              nameForDisplay || cleanNumber,
              profilePicUrl,
              sock
            );

            if (imageBuffer) {
              logger.info(`🖼️ Welcome image generated: ${imageBuffer.length} bytes`);
            }
          }
        } catch (error: any) {
          logger.error(`Error generating welcome image:`, error.message);
        }
      }

      // Send message
      if (imageBuffer) {
        try {
          await sock.sendMessage(targetJid, {
            image: imageBuffer,
            caption: message,
            mentions
          });
          logger.info(`✅ Imagen de bienvenida enviada a "${nameForDisplay}"`);
        } catch (error) {
          // Fallback to text only
          logger.warn(`⚠️ Error enviando imagen, fallback a texto`);
          await sock.sendMessage(targetJid, { text: message, mentions });
        }
      } else {
        await sock.sendMessage(targetJid, { text: message, mentions });
        logger.info(`✅ Mensaje de bienvenida (sin imagen) enviado a "${nameForDisplay}"`);
      }

      return message;
    } catch (error: any) {
      logger.error(`Error al enviar bienvenida:`, error.message);
      return null;
    }
  }

  /**
   * Envía mensaje de bienvenida con datos pre-obtenidos
   * Esta versión recibe profilePicUrl ya calculado desde event-handler
   * para evitar duplicar el fetch de la foto de perfil
   */
  static async sendWelcomeWithData(
    sock: any,
    groupId: string,
    phone: string,
    displayName: string | null,
    memberCount: number | null = null,
    profilePicUrl: string | null = null
  ) {
    try {
      logger.info(`👋 sendWelcomeWithData: phone=${phone}, displayName=${displayName}, profilePic=${profilePicUrl ? 'YES' : 'NO'}`);

      const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;

      // Clean phone number & Resolve LID
      let cleanNumber = phone
        .replace('@s.whatsapp.net', '')
        .replace('@c.us', '')
        .replace('@lid', '')
        .replace(/\D/g, '');

      // RESOLUCIÓN DE LID (Para menciones correctas)
      // Método 1: lidMapping de Baileys (si está disponible)
      // Método 2: FALLBACK - Buscar en metadatos del grupo por nombre
      if (cleanNumber.length >= 14 || phone.includes('@lid')) {
        logger.info(`🔍 [WelcomeService] Detected potential LID: ${cleanNumber}. Attempting resolution...`);
        let resolved = false;

        // MÉTODO 1: lidMapping
        try {
          const lidMap = (sock as any).signalRepository?.lidMapping;
          if (lidMap) {
            const lidJid = phone.includes('@lid') ? phone : `${cleanNumber}@lid`;
            const pnJid = await lidMap.getPNForLID(lidJid);
            if (pnJid) {
              const resolvedPn = pnJid.split('@')[0].split(':')[0];
              logger.info(`✅ [WelcomeService] LID RESOLVED via lidMapping: ${cleanNumber} -> ${resolvedPn}`);
              cleanNumber = resolvedPn;
              resolved = true;
            }
          }
        } catch (e) {
          logger.debug(`[WelcomeService] lidMapping failed: ${e}`);
        }

        // MÉTODO 2: FALLBACK - Buscar en metadata del grupo por NOMBRE
        if (!resolved && displayName && displayName.length > 2) {
          try {
            logger.info(`🔍 [WelcomeService] Trying metadata fallback with name: "${displayName}"`);
            const metadata = await sock.groupMetadata(targetJid);

            for (const p of metadata.participants) {
              const pNumber = p.id.split('@')[0].split(':')[0];
              const isRealPhone = !p.id.includes('@lid') && pNumber.length >= 7 && pNumber.length <= 15;

              // Match by name (notify or pushname)
              const pName = (p as any).notify || (p as any).pushName || '';
              if (isRealPhone && pName.toLowerCase().includes(displayName.toLowerCase().substring(0, 5))) {
                cleanNumber = pNumber;
                logger.info(`✅ [WelcomeService] LID RESOLVED via METADATA (name match): "${displayName}" -> ${pNumber}`);
                resolved = true;
                break;
              }
            }

            if (!resolved) {
              logger.warn(`⚠️ [WelcomeService] Could not resolve LID via metadata. Using displayName for mention.`);
            }
          } catch (e) {
            logger.warn(`⚠️ [WelcomeService] Metadata fallback failed: ${e}`);
          }
        }

        if (!resolved) {
          logger.warn(`⚠️ [WelcomeService] LID UNRESOLVED. Mention may not work correctly.`);
        }
      } else {
        logger.info(`ℹ️ [WelcomeService] Phone appears valid (not LID): ${cleanNumber}`);
      }

      // JID para DM - CRÍTICO: LIDs deben usar @lid, phones usan @s.whatsapp.net
      const isLidForDm = cleanNumber.length >= 14;
      let userJid = isLidForDm
        ? `${cleanNumber}@lid`  // LID: usar @lid para que WhatsApp lo rutee correctamente
        : `${cleanNumber}@s.whatsapp.net`; // Phone real: usar @s.whatsapp.net

      logger.info(`🎯 [WelcomeService] Final Target JID for DM: ${userJid} (isLID=${isLidForDm})`);

      // Get group info
      const group = await GroupRepository.getById(groupId);
      const groupName = group?.name || 'el grupo';

      // Get member count if not provided
      let count = memberCount;
      if (!count) {
        try {
          const metadata = await sock.groupMetadata(targetJid);
          count = metadata.participants.length;
          logger.info(`👥 [WelcomeService] Fetched live member count: ${count}`);
        } catch (e) {
          const members = await MemberRepository.getActiveMembers(groupId);
          count = members.length;
          logger.warn(`⚠️ [WelcomeService] Metadata failed, used DB count: ${count}`);
        }
      }

      // Send DM first (without waiting too much)
      // Send DM first (without waiting too much)
      const dmImageUrl = 'https://res.cloudinary.com/dz1qivt7m/image/upload/v1765843159/anuncio_oficial_ultra_peru_PRECIOS-min_cuycvk.png';
      const dmMessage = `¡Hola! Bienvenido a *RaveHub* 👋👽

Te cuento que *ya puedes adquirir tus entradas* para el **Ultra Perú** directamente con nosotros. 🔥

Lo mejor de esta etapa Early Bird:
✅ Puedes reservar tu entrada *desde hoy con solo S/. 50*.
✅ Tienes la opción de pagar el resto en **3 cuotas mensuales**.

⚠️ _Por favor, no olvides leer las reglas del grupo para una mejor convivencia._`;

      try {
        // Fetch image
        const dmResponse = await fetch(dmImageUrl);
        if (dmResponse.ok) {
          const dmBuffer = Buffer.from(await dmResponse.arrayBuffer());
          await sock.sendMessage(userJid, { image: dmBuffer, caption: dmMessage });
          logger.info(`📨 DM con imagen enviado a ${userJid}`);
        } else {
          throw new Error('Image fetch failed');
        }
      } catch (e: any) {
        logger.warn(`⚠️ Error enviando DM con imagen (fallback a texto): ${e.message}`);
        try {
          await sock.sendMessage(userJid, { text: dmMessage });
        } catch (e2) { }
      }

      // Name for display
      let nameForDisplay = displayName;
      const isValidName = (n: any) => {
        if (!n || typeof n !== 'string') return false;
        const t = n.trim();
        if (/^\d{10,}$/.test(t)) return false;
        return t.length > 0 && t !== 'undefined' && t !== 'null' && t !== 'Unknown' && t !== 'Usuario';
      };

      if (!nameForDisplay || !isValidName(nameForDisplay)) {
        nameForDisplay = cleanNumber;
      }

      // Check welcome config
      const groupConfig = await GroupRepository.getConfig(groupId);
      if (!groupConfig?.welcome?.enabled) {
        logger.info(`ℹ️ Welcome disabled for group ${groupId}`);
        return null;
      }

      // Determinar si tenemos un número real o un LID sin resolver
      const isUnresolvedLid = cleanNumber.length >= 14;

      // Build mention según protocolo Baileys:
      // - Texto: SIEMPRE @{número} (WhatsApp renderiza el nombre automáticamente)
      // - Mentions array: JID completo del usuario
      let userMentionText: string;
      let mentions: string[] = [];

      if (isUnresolvedLid) {
        // LID: usar @{LID_number} en texto y {LID}@lid en mentions
        const lidJid = `${cleanNumber}@lid`;
        userMentionText = `@${cleanNumber}`; // @184980080701681 - WhatsApp lo convierte en enlace azul
        mentions = [lidJid];
        logger.info(`📍 [WelcomeService] LID Mention: text="${userMentionText}", jid="${lidJid}"`);
      } else {
        // Número real: @{phone} en texto y {phone}@s.whatsapp.net en mentions
        userMentionText = `@${cleanNumber}`;
        mentions = [userJid];
        logger.info(`✅ [WelcomeService] Real Mention: text="${userMentionText}", jid="${userJid}"`);
      }

      logger.info(`👋 Mention: text="${userMentionText}", jid="${mentions[0]}", hasMention=${mentions.length > 0}`);

      // Build message
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

      // 🖼️ GESTIÓN DE IMAGEN DE BIENVENIDA (MODO ESTÁTICO)
      // El usuario solicitó desactivar la generación dinámica con Sharp.
      // Ahora solo usamos una imagen estática si se configuró con .welcome set ... URL
      let imageBuffer: Buffer | null = null;

      if (groupConfig.welcome?.imageUrl) {
        try {
          logger.info(`⬇️ Descargando imagen estática de bienvenida: ${groupConfig.welcome.imageUrl}`);
          const res = await fetch(groupConfig.welcome.imageUrl);
          if (res.ok) {
            imageBuffer = Buffer.from(await res.arrayBuffer());
            logger.info(`✅ Imagen estática descargada: ${imageBuffer.length} bytes`);
          } else {
            logger.warn(`⚠️ Error HTTP ${res.status} al descargar imagen estática`);
          }
        } catch (error: any) {
          logger.error(`❌ Error descargando imagen estática:`, error.message);
        }
      } else {
        logger.info(`ℹ️ No se ha configurado imagen estática (.welcome set ... URL), se enviará solo texto.`);
      }

      // Send message
      if (imageBuffer) {
        try {
          await sock.sendMessage(targetJid, {
            image: imageBuffer,
            caption: message,
            mentions
          });
          logger.info(`✅ Imagen de bienvenida enviada a "${nameForDisplay}"`);
        } catch (error) {
          logger.warn(`⚠️ Error enviando imagen, fallback a texto`);
          await sock.sendMessage(targetJid, { text: message, mentions });
        }
      } else {
        await sock.sendMessage(targetJid, { text: message, mentions });
        logger.info(`✅ Mensaje de bienvenida (sin imagen) enviado a "${nameForDisplay}"`);
      }

      return message;
    } catch (error: any) {
      logger.error(`Error en sendWelcomeWithData:`, error.message);
      return null;
    }
  }

  /**
   * Envía mensaje de despedida
   */
  static async sendGoodbye(sock: any, groupId: string, phone: string, displayName: string | null) {
    try {
      const config = await GroupRepository.getConfig(groupId);

      if (!config?.goodbye?.enabled) {
        return null;
      }

      const group = await GroupRepository.getById(groupId);
      const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;

      const message = replacePlaceholders(config.goodbye.message, {
        name: displayName || phone,
        group: group?.name || 'el grupo'
      });

      await sock.sendMessage(targetJid, { text: message });

      logger.info(`Despedida enviada a ${displayName} en grupo ${groupId}`);
      return message;
    } catch (error: any) {
      logger.error(`Error al enviar despedida:`, error.message);
      return null;
    }
  }
}

export default WelcomeService;
