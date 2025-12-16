import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import { displayQR } from '../lib/qr-handler.js';
import logger from '../lib/logger.js';
import fs from 'fs';
const STORE_FILE = './baileys_contacts_store.json';
class ContactStore {
    contacts = {};
    constructor() {
        this.load();
    }
    load() {
        try {
            if (fs.existsSync(STORE_FILE)) {
                const data = fs.readFileSync(STORE_FILE, 'utf-8');
                this.contacts = JSON.parse(data);
                logger.info(`📦 ContactStore: Loaded ${Object.keys(this.contacts).length} contacts`);
            }
        }
        catch (e) {
            logger.warn(`⚠️ Could not load contact store: ${e}`);
            this.contacts = {};
        }
    }
    async save() {
        try {
            await fs.promises.writeFile(STORE_FILE, JSON.stringify(this.contacts, null, 2));
        }
        catch (e) {
            logger.error(`⚠️ Error saving contact store: ${e}`);
        }
    }
    update(jid, info) {
        this.contacts[jid] = {
            ...this.contacts[jid],
            ...info,
            lastSeen: Date.now()
        };
    }
    get(jid) {
        return this.contacts[jid];
    }
    getName(jid) {
        const contact = this.contacts[jid];
        if (!contact)
            return null;
        return contact.name || contact.notify || contact.verifiedName || null;
    }
}
export const contactStore = new ContactStore();
setInterval(async () => {
    try {
        await contactStore.save();
    }
    catch (e) {
        logger.error('Failed to auto-save store', e);
    }
}, 30_000);
export class WhatsAppClient {
    sock = null;
    isConnected = false;
    reconnectAttempts = 0;
    maxReconnectAttempts = 5;
    constructor() {
        logger.info('Creando instancia de cliente de WhatsApp (Baileys)...');
    }
    async initialize() {
        return new Promise(async (resolve, reject) => {
            try {
                logger.info('Iniciando inicialización del cliente Baileys...');
                const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
                const { version, isLatest } = await fetchLatestBaileysVersion();
                logger.info(`Usando Baileys v${version.join('.')}${isLatest ? ' (última versión)' : ''}`);
                this.sock = makeWASocket({
                    version,
                    auth: {
                        creds: state.creds,
                        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
                    },
                    printQRInTerminal: false,
                    browser: Browsers.ubuntu('Chrome'),
                    logger: pino({ level: 'silent' }),
                    generateHighQualityLinkPreview: true,
                    syncFullHistory: true,
                    markOnlineOnConnect: true
                });
                this.sock.ev.on('contacts.update', (updates) => {
                    for (const contact of updates) {
                        if (contact.id && (contact.notify || contact.name)) {
                            contactStore.update(contact.id, {
                                notify: contact.notify,
                                name: contact.name,
                                verifiedName: contact.verifiedName
                            });
                            logger.debug(`[ARIA] Contact updated: ${contact.id} -> "${contact.notify || contact.name}"`);
                        }
                    }
                });
                this.sock.ev.on('messages.upsert', ({ messages }) => {
                    for (const msg of messages) {
                        if (msg.pushName) {
                            const sender = msg.key.participant || msg.key.remoteJid;
                            if (sender) {
                                contactStore.update(sender, { notify: msg.pushName });
                                logger.debug(`[ARIA] PushName captured: ${sender} -> "${msg.pushName}"`);
                            }
                        }
                    }
                });
                this.sock.ev.on('connection.update', async (update) => {
                    const { connection, lastDisconnect, qr } = update;
                    if (qr) {
                        displayQR(qr);
                        logger.info('QR code generado - escanea con WhatsApp');
                    }
                    if (connection === 'close') {
                        const statusCode = lastDisconnect?.error?.output?.statusCode;
                        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                        logger.warn(`Conexión cerrada. Código: ${statusCode}. Reconectar: ${shouldReconnect}`);
                        if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                            this.reconnectAttempts++;
                            logger.info(`Intento de reconexión ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
                            await new Promise(r => setTimeout(r, 3000));
                            try {
                                this.sock = await this.initialize();
                            }
                            catch (error) {
                                logger.error('Error en reconexión:', error);
                            }
                        }
                        else if (statusCode === DisconnectReason.loggedOut) {
                            logger.error('❌ Sesión cerrada. Elimina la carpeta baileys_auth y vuelve a escanear el QR.');
                            reject(new Error('Sesión cerrada por el usuario'));
                        }
                    }
                    if (connection === 'open') {
                        this.isConnected = true;
                        this.reconnectAttempts = 0;
                        logger.info('✅ Cliente de WhatsApp conectado exitosamente');
                        resolve(this.sock);
                    }
                });
                this.sock.ev.on('creds.update', saveCreds);
                const timeout = setTimeout(() => {
                    if (!this.isConnected) {
                        logger.error('❌ Timeout: La inicialización tomó más de 2 minutos');
                        reject(new Error('Timeout: La inicialización del cliente tomó más de 2 minutos'));
                    }
                }, 2 * 60 * 1000);
                this.sock.ev.on('connection.update', (update) => {
                    if (update.connection === 'open') {
                        clearTimeout(timeout);
                    }
                });
            }
            catch (error) {
                logger.error('❌ Error al inicializar cliente de WhatsApp:', error);
                reject(error);
            }
        });
    }
    getClient() {
        if (!this.sock) {
            throw new Error('Cliente no inicializado');
        }
        return this.sock;
    }
    getContactStore() {
        return contactStore;
    }
    async sendMessage(to, content, options) {
        if (!this.sock) {
            throw new Error('Cliente no inicializado');
        }
        const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
        return this.sock.sendMessage(jid, content, options);
    }
    async reply(msg, content) {
        if (!this.sock) {
            throw new Error('Cliente no inicializado');
        }
        const chatId = msg.key.remoteJid;
        if (typeof content === 'string') {
            return this.sock.sendMessage(chatId, { text: content }, { quoted: msg });
        }
        return this.sock.sendMessage(chatId, content, { quoted: msg });
    }
    async react(msg, emoji) {
        if (!this.sock || !msg.key)
            return;
        const jid = msg.key.remoteJid;
        const key = msg.key;
        await this.sock.sendMessage(jid, {
            react: { text: emoji, key }
        });
    }
    getInfo() {
        if (!this.sock?.user) {
            return null;
        }
        return {
            wid: {
                user: this.sock.user.id.split(':')[0].split('@')[0],
                _serialized: this.sock.user.id
            },
            pushname: this.sock.user.name || '',
            platform: 'web'
        };
    }
    isReady() {
        return this.isConnected && this.sock !== null;
    }
}
export default WhatsAppClient;
