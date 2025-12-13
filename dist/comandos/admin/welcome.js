import ConfigService from '../../services/ConfigService.js';
import { formatSuccess } from '../../utils/formatter.js';
export default {
    name: 'welcome',
    description: 'Configurar mensajes de bienvenida',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, msg, args, rawArgs, groupId, replyJid }) {
        const action = args[0]?.toLowerCase();
        if (action === 'on') {
            await ConfigService.updateGroupConfig(groupId, {
                'welcome.enabled': true
            });
            await sock.sendMessage(replyJid, formatSuccess('Bienvenidas activadas'));
        }
        else if (action === 'off') {
            await ConfigService.updateGroupConfig(groupId, {
                'welcome.enabled': false
            });
            await sock.sendMessage(replyJid, formatSuccess('Bienvenidas desactivadas'));
        }
        else if (action === 'set' && args.length > 1) {
            const setIndex = rawArgs.toLowerCase().indexOf('set');
            const message = setIndex !== -1
                ? rawArgs.substring(setIndex + 3).trim()
                : args.slice(1).join(' ');
            await ConfigService.updateGroupConfig(groupId, {
                'welcome.message': message
            });
            await sock.sendMessage(replyJid, formatSuccess(`Mensaje de bienvenida actualizado:\n\n${message}`));
        }
        else if (action === 'status') {
            const config = await ConfigService.getGroupConfig(groupId);
            const welcome = config.welcome || {};
            await sock.sendMessage(replyJid, `📋 CONFIGURACIÓN DE BIENVENIDAS\n` +
                `Estado: ${welcome.enabled ? '✅ Activado' : '❌ Desactivado'}\n` +
                `Mensaje actual:\n"${welcome.message || 'Sin mensaje'}"\n\n` +
                `💡 Usa .welcome off para desactivar\n` +
                `💡 Usa .welcome set [mensaje] para cambiar el mensaje`);
        }
        else {
            await sock.sendMessage(replyJid, `Uso: .welcome on/off/set/status\n` +
                `on - Activa bienvenidas\n` +
                `off - Desactiva bienvenidas\n` +
                `set [mensaje] - Configura mensaje\n` +
                `status - Ver estado actual\n\n` +
                `Placeholders disponibles: {user}, {group}, {count}\n` +
                `{user} = Mención cliqueable del usuario\n` +
                `{group} = Nombre del grupo\n` +
                `{count} = Número de miembros\n\n` +
                `Ejemplo: .welcome set ¡Bienvenido {user} al grupo {group}!`);
        }
    }
};
