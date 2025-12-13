import GroupService from '../../services/GroupService.js';
import { formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import { resolveGroupMetadata } from '../../utils/group.js';
import { normalizeGroupId, groupIdToJid } from '../../utils/phone.js';
export default {
    name: 'activategroup',
    description: 'Activar bot en un grupo',
    category: 'internal',
    permissions: 'global_admin',
    scope: 'dm',
    cooldown: 10,
    async execute({ sock, msg, args, replyJid }) {
        await msg.react(EMOJIS.LOADING);
        const rawGroupId = args[0];
        if (!rawGroupId) {
            await sock.sendMessage(replyJid, formatError('Debes especificar el ID del grupo'));
            return;
        }
        const groupId = normalizeGroupId(rawGroupId);
        const groupJid = groupIdToJid(groupId);
        try {
            const groupMetadata = await resolveGroupMetadata(sock, groupJid, msg);
            await sock.sendMessage(replyJid, `⏳ Activando grupo: ${groupMetadata.subject}\n[██████████] 100%`);
            await GroupService.activateGroup(groupId, groupMetadata);
            await sock.sendMessage(replyJid, `${EMOJIS.SUCCESS} Grupo activado exitosamente\n\n` +
                `📊 Resumen:\n\n` +
                `ID: ${groupId}\n` +
                `Nombre: ${groupMetadata.subject}\n` +
                `Miembros: ${groupMetadata.participants?.length || 0}\n` +
                `Mensajes guardados: 0\n` +
                `Puntos totales: 0\n\n` +
                `${EMOJIS.SUCCESS} Configuración creada\n` +
                `${EMOJIS.SUCCESS} Todos los miembros registrados en Firestore\n` +
                `${EMOJIS.SUCCESS} El bot ahora guarda mensajes de este grupo\n` +
                `${EMOJIS.SUCCESS} Sistema de puntos activado\n\n` +
                `El bot está listo para funcionar en este grupo.`);
            try {
                await sock.sendMessage(groupJid, `${EMOJIS.ROBOT} Bot activado desde chat privado\n` +
                    `El bot ahora está activo en este grupo.\n` +
                    `Usa .help para ver los comandos disponibles.`);
            }
            catch (error) {
            }
            await msg.react(EMOJIS.SUCCESS);
        }
        catch (error) {
            await msg.react(EMOJIS.ERROR);
            await sock.sendMessage(replyJid, formatError(`Error al activar grupo: ${error.message}`));
        }
    }
};
