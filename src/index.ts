import { initializeFirebase } from './config/firebase.js';
import { loadCommands } from './core/command-loader.js';
import WhatsAppClient from './core/whatsapp-client.js';
import EventHandler from './core/event-handler.js';
import ConfigRepository from './repositories/ConfigRepository.js';
import GroupService from './services/GroupService.js';
import MemberService from './services/MemberService.js';
import GroupRepository from './repositories/GroupRepository.js';
import MemberRepository from './repositories/MemberRepository.js';
import { config } from './config/environment.js';
import logger from './lib/logger.js';
import { normalizePhone, normalizeGroupId } from './utils/phone.js';

async function main() {
  try {
    logger.info('🚀 Iniciando bot de WhatsApp...');

    // 1. Inicializar Firebase
    initializeFirebase();
    logger.info('✅ Firebase inicializado');

    // 2. Cargar comandos
    await loadCommands();
    logger.info('✅ Comandos cargados');

    // 3. Inicializar cliente de WhatsApp
    logger.info('🔄 Inicializando cliente de WhatsApp...');
    const whatsappClient = new WhatsAppClient();
    try {
      await whatsappClient.initialize();
      logger.info('✅ Cliente de WhatsApp inicializado correctamente');
    } catch (error) {
      logger.error('❌ Error al inicializar cliente de WhatsApp:', error);
      throw error;
    }

    // 4. Configurar eventos
    const eventHandler = new EventHandler(whatsappClient.getClient());
    const client = whatsappClient.getClient();

    // Registrar múltiples eventos de mensajes para asegurar captura
    client.on('message', async (msg) => {
      await eventHandler.handleMessage(msg);
    });

    client.on('message_create', async (msg) => {
      await eventHandler.handleMessage(msg);
    });

    // DEBUG: Loggear eventos relevantes (Filtrado para evitar spam ilegible)
    const importantEvents = ['group_join', 'group_leave']; 
    for (const eventName of importantEvents) {
      client.on(eventName, (...args) => {
        // Log simplificado
        logger.info(`[EVENT] ${eventName}: ${args.length} args received`);
      });
    }

    client.on('group_participants_update', async (update) => {
      // Log simplificado
      logger.info(`[EVENT] group_participants_update: ${update.action} on ${update.id?._serialized || 'unknown'}`);
      await eventHandler.handleGroupParticipantsUpdate(update);
    });

    // Backup events for join/leave (estos ya están registrados arriba para debug, aquí procesamos)
    client.on('group_join', async (notification) => {
      logger.info(`[RAW EVENT] group_join: ${JSON.stringify(notification)}`);
      await eventHandler.handleGroupJoin(notification);
    });

    client.on('group_leave', async (notification) => {
      logger.info(`[RAW EVENT] group_leave: ${JSON.stringify(notification)}`);
      await eventHandler.handleGroupLeave(notification);
    });

    // Evento adicional: membership request (para grupos con aprobación)
    client.on('group_membership_request', async (notification) => {
      logger.info(`[RAW EVENT] group_membership_request: ${JSON.stringify(notification)}`);
      // Procesar como join si es apropiado
    });

    // Auto-sync: Actualizar metadatos cuando cambia el grupo
    client.on('group_update', async (update) => {
      try {
        const chatId = update.id?._serialized || update.chatId;
        if (!chatId) return;

        logger.info(`[GROUP_UPDATE] Grupo ${chatId} actualizado`);
        const groupId = normalizeGroupId(chatId);
        
        let chat;
        try {
           chat = await client.getChatById(chatId);
        } catch (err) {
           // Si falla getChatById (común en group_update temprano), intentar esperar un poco
           logger.warn(`[GROUP_UPDATE] getChatById falló, reintentando en 1s...`);
           await new Promise(r => setTimeout(r, 1000));
           try {
              chat = await client.getChatById(chatId);
           } catch (err2) {
              logger.error(`[GROUP_UPDATE] No se pudo obtener el chat tras reintento: ${err2.message}`);
              return;
           }
        }

        const metadata = await GroupService.extractCompleteMetadata(chat);
        await GroupRepository.update(groupId, {
          name: metadata.name,
          description: metadata.description,
          restrict: metadata.restrict,
          announce: metadata.announce,
          isReadOnly: metadata.isReadOnly,
          updatedAt: new Date().toISOString()
        });

        logger.info(`[GROUP_UPDATE] Metadatos actualizados para grupo ${groupId}`);
      } catch (error) {
        logger.error(`[GROUP_UPDATE] Error al actualizar grupo:`, error);
      }
    });

    // Auto-sync: Actualizar configuración del grupo
    client.on('group_settings_update', async (update) => {
      try {
        logger.info(`[GROUP_SETTINGS_UPDATE] Configuración del grupo ${update.id._serialized} actualizada`);
        const groupId = normalizeGroupId(update.id._serialized);
        const chat = await client.getChatById(update.id._serialized);

        await GroupRepository.update(groupId, {
          isReadOnly: chat.isReadOnly || false,
          announce: chat.announce || false,
          restrict: chat.restrict || false,
          updatedAt: new Date().toISOString()
        });

        logger.info(`[GROUP_SETTINGS_UPDATE] Configuración actualizada para grupo ${groupId}`);
      } catch (error) {
        logger.error(`[GROUP_SETTINGS_UPDATE] Error al actualizar configuración:`, error);
      }
    });

    // Auto-sync: Actualizar contactos cuando cambian
    client.on('contact_changed', async (contact) => {
      try {
        const phone = normalizePhone(contact.id._serialized);
        if (!phone) return;

        logger.info(`[CONTACT_CHANGED] Contacto ${phone} actualizado`);

        // Actualizar en todos los grupos donde sea miembro
        const chats = await client.getChats();
        const groupChats = chats.filter(c => c.isGroup);

        for (const chat of groupChats) {
          const groupId = normalizeGroupId(chat.id._serialized);
          const group = await GroupRepository.getById(groupId);

          if (!group || !group.isActive) continue;

          // Verificar si el contacto es miembro
          const participants = chat.participants || [];
          const isMember = participants.some(p => normalizePhone(p.id._serialized) === phone);

          if (isMember) {
            const participant = chat.participants.find(p => normalizePhone(p.id._serialized) === phone);
            const memberMetadata = await MemberService.extractCompleteMemberMetadata(participant, contact, phone, groupId);
            await MemberRepository.update(groupId, phone, {
              name: memberMetadata.name,
              pushname: memberMetadata.pushname,
              shortName: memberMetadata.shortName,
              profilePicUrl: memberMetadata.profilePicUrl,
              updatedAt: new Date().toISOString()
            });

            logger.info(`[CONTACT_CHANGED] Miembro ${phone} actualizado en grupo ${groupId}`);
          }
        }
      } catch (error) {
        logger.error(`[CONTACT_CHANGED] Error al actualizar contacto:`, error);
      }
    });

    logger.info('Eventos de mensajes registrados correctamente');

    // 5. Guardar número del bot como owner si es la primera vez
    whatsappClient.getClient().on('ready', async () => {
      const info = whatsappClient.getClient().info;
      const botPhone = normalizePhone(info.wid.user);
      const ownerPhone = `${botPhone}@s.whatsapp.net`;

      const globalConfig = await ConfigRepository.getGlobal();
      const isFirstTime = !globalConfig || !globalConfig.ownerPhone;

      if (isFirstTime) {
        await ConfigRepository.saveGlobal({
          ownerPhone: botPhone,
          adminPhones: config.permissions.adminPhones || [],
          pointsName: config.points.name,
          pointsPerMessages: config.points.perMessages,
          pointsEnabled: config.points.enabled
        });
        logger.info(`✅ Owner configurado: ${botPhone}`);
      }

      // Enviar mensaje de bienvenida al owner
      let welcomeMessage = '';
      try {
        // Esperar un poco para asegurar que la conexión esté completa
        await new Promise(resolve => setTimeout(resolve, 2000));

        welcomeMessage =
          `🤖 *Bot de WhatsApp Inicializado*\n\n` +
          `✅ Bot conectado y listo\n` +
          `👤 Owner: ${info.pushname || botPhone}\n` +
          `📱 Número: ${botPhone}\n\n` +
          `💡 *Comandos disponibles:*\n` +
          `• .help - Ver todos los comandos\n` +
          `• .listgroups - Ver grupos donde está el bot\n` +
          `• .ping - Verificar latencia\n\n` +
          `Para activar el bot en un grupo, escribe: .bot on`;

        await whatsappClient.getClient().sendMessage(ownerPhone, welcomeMessage);
        logger.info(`✅ Mensaje de bienvenida enviado al owner: ${ownerPhone}`);
      } catch (error) {
        logger.error('Error al enviar mensaje de bienvenida:', error);
        // Intentar con el formato alternativo
        try {
          const altPhone = info.wid.user.includes('@') ? info.wid.user : `${info.wid.user}@s.whatsapp.net`;
          await whatsappClient.getClient().sendMessage(altPhone, welcomeMessage);
          logger.info(`✅ Mensaje de bienvenida enviado (formato alternativo): ${altPhone}`);
        } catch (err2) {
          logger.error('Error al enviar mensaje de bienvenida (intento alternativo):', err2);
        }
      }

      logger.info('✅ Bot completamente inicializado y listo');
    });

  } catch (error) {
    logger.error('❌ Error fatal al iniciar bot:', error);
    process.exit(1);
  }
}

main();

