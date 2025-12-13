import ConfigRepository from '../../repositories/ConfigRepository.js';
import { normalizePhone } from '../../utils/phone.js';
import logger from '../../lib/logger.js';
export default {
    name: 'setowner',
    description: 'Transferir propiedad del bot a otro usuario (owner)',
    usage: '.setowner {phone}',
    category: 'owner',
    permissions: 'owner',
    scope: 'any',
    async execute({ sock, msg, args }) {
        const phone = args[0];
        if (!phone) {
            await msg.reply(' Debes proporcionar el numero de telefono del nuevo owner.\n\nUso: .setowner {phone}\n\nEjemplo: .setowner 5491123456789');
            return;
        }
        try {
            const normalizedPhone = normalizePhone(phone);
            if (!normalizedPhone) {
                await msg.reply(' Numero de telefono invalido.');
                return;
            }
            const config = await ConfigRepository.getGlobal();
            const currentOwner = config?.ownerPhone;
            if (normalizedPhone === currentOwner) {
                await msg.reply(' Ese usuario ya es el owner actual.');
                return;
            }
            const confirmMsg = ' *ADVERTENCIA: Transferencia de Propiedad*\n\n' +
                'Estas a punto de transferir la propiedad del bot a:\n' +
                ' ' + normalizedPhone + '\n\n' +
                ' *Perderas todos los privilegios de owner*\n\n' +
                'Para confirmar, escribe:\n' +
                '.setowner ' + normalizedPhone + ' confirm';
            if (!args[1] || args[1] !== 'confirm') {
                await msg.reply(confirmMsg);
                return;
            }
            await ConfigRepository.saveGlobal({
                ...config,
                ownerPhone: normalizedPhone,
                previousOwner: currentOwner,
                ownerChangedAt: new Date().toISOString()
            });
            try {
                const newOwnerJid = normalizedPhone + '@s.whatsapp.net';
                const newOwnerMsg = ' *Eres el nuevo Owner del Bot*\n\n' +
                    'El usuario ' + currentOwner + ' te ha transferido la propiedad del bot.\n\n' +
                    'Ahora tienes acceso completo a todos los comandos de owner.\n\n' +
                    'Escribe .help para ver los comandos disponibles.';
                await sock.sendMessage(newOwnerJid, newOwnerMsg);
            }
            catch (err) {
                logger.warn('[SETOWNER] No se pudo notificar al nuevo owner:', err);
            }
            await msg.reply(' *Propiedad Transferida*\n\n' +
                ' Nuevo owner: ' + normalizedPhone + '\n' +
                ' Owner anterior: ' + currentOwner + '\n\n' +
                'La transferencia se ha completado exitosamente.');
            logger.info('[SETOWNER] Propiedad transferida de ' + currentOwner + ' a ' + normalizedPhone);
        }
        catch (error) {
            logger.error('[SETOWNER] Error:', error);
            await msg.reply(' Error al transferir la propiedad del bot.');
        }
    }
};
