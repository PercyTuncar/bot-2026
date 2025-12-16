import { initializeFirebase } from './config/firebase.js';
import { loadCommands } from './core/command-loader.js';
import WhatsAppClient from './core/whatsapp-client.js';
import EventHandler from './core/event-handler.js';
import ConfigRepository from './repositories/ConfigRepository.js';
import { config } from './config/environment.js';
import logger from './lib/logger.js';
async function main() {
    try {
        logger.info('🚀 Iniciando bot de WhatsApp (Baileys)...');
        initializeFirebase();
        logger.info('✅ Firebase inicializado');
        await loadCommands();
        logger.info('✅ Comandos cargados');
        logger.info('🔄 Inicializando cliente de WhatsApp (Baileys)...');
        const whatsappClient = new WhatsAppClient();
        try {
            const sock = await whatsappClient.initialize();
            logger.info('✅ Cliente de WhatsApp inicializado correctamente');
            const eventHandler = new EventHandler(sock);
            logger.info('✅ Eventos de mensajes registrados correctamente');
            logger.info('⏳ Esperando que la información del usuario esté disponible...');
            let info = null;
            let attempts = 0;
            const maxAttempts = 10;
            while (!info && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                info = whatsappClient.getInfo();
                attempts++;
                if (!info) {
                    logger.debug(`Intento ${attempts}/${maxAttempts}: sock.user aún no disponible`);
                }
            }
            if (info) {
                logger.info(`✅ Info del bot obtenida: ${info.wid.user} (${info.pushname})`);
                const botPhone = info.wid.user;
                const ownerJid = `${botPhone}@s.whatsapp.net`;
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
                try {
                    const welcomeMessage = `🤖 *Bot de WhatsApp Inicializado*\n\n` +
                        `✅ Bot conectado y listo (Baileys)\n` +
                        `👤 Owner: ${info.pushname || botPhone}\n` +
                        `📱 Número: ${botPhone}\n\n` +
                        `💡 *Comandos disponibles:*\n` +
                        `• .help - Ver todos los comandos\n` +
                        `• .listgroups - Ver grupos donde está el bot\n` +
                        `• .ping - Verificar latencia\n\n` +
                        `Para activar el bot en un grupo, escribe: .bot on`;
                    logger.info(`📨 Enviando mensaje de bienvenida a ${ownerJid}...`);
                    await sock.sendMessage(ownerJid, { text: welcomeMessage });
                    logger.info(`✅ Mensaje de bienvenida enviado al owner: ${ownerJid}`);
                }
                catch (error) {
                    logger.error('Error al enviar mensaje de bienvenida:', error.message || error);
                }
            }
            else {
                logger.warn('⚠️ No se pudo obtener la información del bot después de varios intentos');
            }
            logger.info('✅ Bot completamente inicializado y listo');
        }
        catch (error) {
            logger.error('❌ Error al inicializar cliente de WhatsApp:', error);
            throw error;
        }
    }
    catch (error) {
        logger.error('❌ Error fatal al iniciar bot:', error);
        process.exit(1);
    }
}
main();
