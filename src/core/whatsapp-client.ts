import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import { displayQR } from '../lib/qr-handler.js';
import logger from '../lib/logger.js';
import { config } from '../config/environment.js';
import { buildGroupMetadata } from '../utils/group.js';

export class WhatsAppClient {
  private client: any;

  constructor() {
    try {
      logger.info('Creando instancia de cliente de WhatsApp...');
      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: '.wwebjs_auth'
        }),
        // Fix: Use a stable web version to prevent repeated reloads/navigation errors
        webVersionCache: {
          type: 'remote',
          remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        },
        puppeteer: {
          headless: true,
          executablePath: process.env.CHROME_BIN || undefined,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--disable-gpu',
            '--single-process',
            '--no-zygote',
            '--disable-extensions'
          ]
        }
      });

      this.setupEvents();
      logger.info('Instancia de cliente creada correctamente');
    } catch (error) {
      logger.error('Error al crear cliente de WhatsApp:', error);
      throw error;
    }
  }

  setupEvents() {
    this.client.on('qr', (qr) => {
      displayQR(qr);
      logger.info('QR code generado');
    });

    this.client.on('ready', async () => {
      logger.info('✅ Cliente de WhatsApp listo');

      // CRITICAL FIX: Inject Polyfill for getIsMyContact to prevent crashes with LIDs
      try {
        // @ts-ignore - pupPage is internal but accessible
        const page = this.client.pupPage;
        if (page) {
          await page.evaluate(() => {
            // Ensure window.Store exists and patch the missing function
            // @ts-ignore
            if (window.Store && window.Store.ContactMethods) {
              // @ts-ignore
              if (typeof window.Store.ContactMethods.getIsMyContact !== 'function') {
                console.log('[Polyfill] Injecting getIsMyContact...');
                // @ts-ignore
                window.Store.ContactMethods.getIsMyContact = () => false;
              }
            }
          });
          logger.info('✅ Polyfill getIsMyContact injected successfully');
        }
      } catch (err) {
        logger.warn(`⚠️ Failed to inject polyfill: ${err.message}`);
      }

      const info = this.client.info;
      logger.info(`Conectado como: ${info.pushname || info.wid.user}`);
    });

    this.client.on('authenticated', () => {
      logger.info('✅ Autenticado');
    });

    this.client.on('auth_failure', (msg) => {
      logger.error('❌ Error de autenticación:', msg);
    });

    this.client.on('disconnected', (reason) => {
      logger.warn('Desconectado:', reason);
    });

    this.client.on('loading_screen', (percent, message) => {
      logger.info(`Cargando WhatsApp Web: ${percent}% - ${message}`);
    });

    this.client.on('change_state', (state) => {
      logger.info(`Estado del cliente cambiado: ${state}`);
    });

    this.client.on('change_battery', (batteryInfo) => {
      logger.info(`Batería: ${batteryInfo.battery}% - Cargando: ${batteryInfo.plugged}`);
    });

    // Manejar errores no capturados
    this.client.on('error', (error) => {
      logger.error('❌ Error en cliente de WhatsApp:', error);
    });

    this.client.on('message_create', async (msg) => {
      // Se maneja en EventHandler
    });
  }

  async initialize() {
    return new Promise(async (resolve, reject) => {
      try {
        logger.info('Iniciando inicialización del cliente...');

        // Timeout de 2 minutos
        const timeout = setTimeout(() => {
          logger.error('❌ Timeout: La inicialización tomó más de 2 minutos');
          reject(new Error('Timeout: La inicialización del cliente tomó más de 2 minutos'));
        }, 2 * 60 * 1000);

        try {
          // Inicializar el cliente
          await this.client.initialize();
          clearTimeout(timeout);
          logger.info('✅ Cliente de WhatsApp inicializado exitosamente');
          resolve(undefined);
        } catch (initError) {
          clearTimeout(timeout);
          logger.error('❌ Error durante inicialización:', initError);
          logger.error('Mensaje:', initError.message);
          if (initError.stack) {
            logger.error('Stack:', initError.stack);
          }
          reject(initError);
        }
      } catch (error) {
        logger.error('❌ Error al inicializar cliente de WhatsApp:', error);
        logger.error('Mensaje:', error.message);
        if (error.stack) {
          logger.error('Stack:', error.stack);
        }
        reject(error);
      }
    });
  }

  getClient() {
    return this.client;
  }

  async sendMessage(to, content) {
    return await this.client.sendMessage(to, content);
  }

  async getGroupMetadata(groupId) {
    const chat = await this.client.getChatById(groupId);
    if (!chat || !chat.isGroup) {
      throw new Error('El chat no es un grupo o no se pudo encontrar');
    }
    return buildGroupMetadata(chat, groupId);
  }
}

export default WhatsAppClient;

