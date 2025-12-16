import ConfigService from '../../services/ConfigService.js';
import { EMOJIS } from '../../config/constants.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';
export default {
    name: 'welcome',
    description: 'Configurar mensajes de bienvenida',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, msg, args, rawArgs, groupId, replyJid }) {
        try {
            await reactLoading(sock, msg);
            const action = args[0]?.toLowerCase();
            if (action === 'on') {
                await ConfigService.updateGroupConfig(groupId, {
                    'welcome.enabled': true
                });
                await reply(sock, msg, `${EMOJIS.SUCCESS} Bienvenidas activadas`);
                await reactSuccess(sock, msg);
            }
            else if (action === 'off') {
                await ConfigService.updateGroupConfig(groupId, {
                    'welcome.enabled': false
                });
                await reply(sock, msg, `${EMOJIS.SUCCESS} Bienvenidas desactivadas`);
                await reactSuccess(sock, msg);
            }
            else if (action === 'set' && args.length > 1) {
                const setIndex = rawArgs.toLowerCase().indexOf('set');
                let fullContent = setIndex !== -1
                    ? rawArgs.substring(setIndex + 3).trim()
                    : args.slice(1).join(' ');
                const lines = fullContent.split('\n');
                const lastLine = lines[lines.length - 1].trim();
                const urlRegex = /(https?:\/\/.*\.(?:png|jpg|jpeg|webp|gif))/i;
                let message = fullContent;
                let imageUrl = null;
                if (urlRegex.test(lastLine)) {
                    imageUrl = lastLine.match(urlRegex)[0];
                    if (lastLine === imageUrl) {
                        message = lines.slice(0, -1).join('\n').trim();
                    }
                    else {
                        message = fullContent.replace(imageUrl, '').trim();
                    }
                }
                await ConfigService.updateGroupConfig(groupId, {
                    'welcome.message': message,
                    'welcome.imageUrl': imageUrl
                });
                await reply(sock, msg, `${EMOJIS.SUCCESS} Mensaje de bienvenida actualizado:\n\n📝 *Texto:* "${message}"\n🖼️ *Imagen:* ${imageUrl ? 'Sí (' + imageUrl + ')' : 'No (Automática desactivada)'}`);
                await reactSuccess(sock, msg);
            }
            else if (action === 'status') {
                const config = await ConfigService.getGroupConfig(groupId);
                const welcome = config.welcome || {};
                await reply(sock, msg, `📋 *CONFIGURACIÓN DE BIENVENIDAS*\n\n` +
                    `Estado: ${welcome.enabled ? '✅ Activado' : '❌ Desactivado'}\n` +
                    `Mensaje actual:\n"${welcome.message || 'Sin mensaje'}"\n\n` +
                    `💡 Usa .welcome off para desactivar\n` +
                    `💡 Usa .welcome set [mensaje] para cambiar el mensaje`);
                await reactSuccess(sock, msg);
            }
            else {
                await reply(sock, msg, `*Uso:* .welcome on/off/set/status\n\n` +
                    `• *on* - Activa bienvenidas\n` +
                    `• *off* - Desactiva bienvenidas\n` +
                    `• *set [mensaje]* - Configura mensaje\n` +
                    `• *status* - Ver estado actual\n\n` +
                    `*Placeholders disponibles:*\n` +
                    `• {user} = Mención cliqueable del usuario\n` +
                    `• {group} = Nombre del grupo\n` +
                    `• {count} = Número de miembros\n\n` +
                    `*Ejemplo:* .welcome set ¡Bienvenido {user} al grupo {group}!`);
                await reactSuccess(sock, msg);
            }
        }
        catch (error) {
            await reactError(sock, msg);
            await reply(sock, msg, `${EMOJIS.ERROR} Error en comando welcome: ${error.message}`);
        }
    }
};
