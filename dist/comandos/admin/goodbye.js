import ConfigService from '../../services/ConfigService.js';
import { formatSuccess } from '../../utils/formatter.js';
export default {
    name: 'goodbye',
    description: 'Configurar mensajes de despedida',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, msg, args, groupId, replyJid }) {
        try {
            const action = args[0]?.toLowerCase();
            if (action === 'on') {
                await ConfigService.updateGroupConfig(groupId, {
                    'goodbye.enabled': true
                });
                await sock.sendMessage(replyJid, formatSuccess('Despedidas activadas'));
            }
            else if (action === 'off') {
                await ConfigService.updateGroupConfig(groupId, {
                    'goodbye.enabled': false
                });
                await sock.sendMessage(replyJid, formatSuccess('Despedidas desactivadas'));
            }
            else if (action === 'set' && args.length > 1) {
                const message = args.slice(1).join(' ');
                await ConfigService.updateGroupConfig(groupId, {
                    'goodbye.message': message
                });
                await sock.sendMessage(replyJid, formatSuccess('Mensaje de despedida actualizado'));
            }
            else {
                await sock.sendMessage(replyJid, `Uso: .goodbye on/off/set\n` +
                    `on - Activa despedidas\n` +
                    `off - Desactiva despedidas\n` +
                    `set [mensaje] - Configura mensaje\n\n` +
                    `Placeholders disponibles: {name}, {group}, {count}`);
            }
        }
        catch (error) {
            console.error('[GOODBYE] Error:', error);
            await sock.sendMessage(replyJid, '❌ Error al configurar despedidas');
        }
    }
};
