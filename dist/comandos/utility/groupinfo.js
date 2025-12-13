import GroupService from '../../services/GroupService.js';
import { EMOJIS } from '../../config/constants.js';
import ConfigService from '../../services/ConfigService.js';
import { formatDate, formatNumber } from '../../utils/formatter.js';
import { formatError } from '../../utils/formatter.js';
import { bold, section, joinSections } from '../../utils/message-builder.js';
import { reply } from '../../utils/reply.js';
export default {
    name: 'groupinfo',
    description: 'Información detallada de un grupo',
    category: 'internal',
    permissions: 'global_admin',
    scope: 'dm',
    cooldown: 10,
    async execute({ sock, args, replyJid, msg }) {
        const groupId = args[0];
        if (!groupId) {
            await sock.sendMessage(replyJid, formatError('Debes especificar el ID del grupo'));
            return;
        }
        try {
            const info = await GroupService.getGroupInfo(groupId);
            if (!info) {
                await sock.sendMessage(replyJid, formatError('Grupo no encontrado'));
                return;
            }
            const config = await ConfigService.getGroupConfig(groupId);
            const header = `${EMOJIS.INFO} ${bold('INFORMACIÓN DEL GRUPO')}`;
            const general = section('General', [
                `Nombre: ${info.name}`,
                `ID: ${info.id}`,
                `Estado: ${info.isActive ? '✅ Activo' : '❌ Inactivo'}`
            ]);
            const members = section('👥 Miembros', [`Total: ${info.memberCount}`]);
            const messages = section('📨 Mensajes', [`Total: ${formatNumber(info.totalMessages || 0)}`]);
            const points = section(`${EMOJIS.POINTS} Puntos`, [`Total acumulado: ${formatNumber(info.totalPoints || 0)}`]);
            const settings = section('⚙️ Configuración', [
                `Bienvenidas: ${config.welcome?.enabled ? 'Activadas' : 'Desactivadas'}`,
                `Despedidas: ${config.goodbye?.enabled ? 'Activadas' : 'Desactivadas'}`,
                `Límite de advertencias: ${config.limits?.maxWarnings || 3}`,
                `Auto-expulsión: ${config.limits?.autoKickOnMaxWarns ? 'Activada' : 'Desactivada'}`
            ]);
            const dates = info.activatedAt ? section('📅 Fechas', [`Activado: ${formatDate(info.activatedAt)}`]) : '';
            await reply(sock, msg, joinSections([header, general, members, messages, points, settings, dates]));
        }
        catch (error) {
            await sock.sendMessage(replyJid, formatError(`Error al obtener información: ${error.message}`));
        }
    }
};
