import GroupRepository from '../../repositories/GroupRepository.js';
import { formatDate } from '../../utils/formatter.js';
import { normalizeGroupId } from '../../utils/phone.js';
import logger from '../../lib/logger.js';
import { EMOJIS } from '../../config/constants.js';
export default {
    name: 'listgroups',
    aliases: ['grupos', 'mygroups'],
    description: 'Listar todos los grupos donde está el bot como miembro',
    category: 'owner',
    permissions: 'global_admin',
    scope: 'any',
    cooldown: 15,
    async execute({ sock, msg, replyJid }) {
        try {
            await msg.react(EMOJIS.LOADING);
            await sock.sendMessage(replyJid, '🔄 _Obteniendo lista de grupos desde WhatsApp..._');
            const allChats = await sock.getChats();
            const whatsappGroups = allChats.filter(chat => chat.isGroup);
            logger.info(`[listgroups] Encontrados ${whatsappGroups.length} grupos en WhatsApp`);
            const dbGroups = await GroupRepository.getAll();
            const dbGroupsMap = new Map();
            dbGroups.forEach(g => {
                const normalizedId = normalizeGroupId(g.id);
                dbGroupsMap.set(normalizedId, g);
            });
            const activeGroups = [];
            const inactiveGroups = [];
            const neverRegisteredGroups = [];
            for (const chat of whatsappGroups) {
                const groupId = chat.id._serialized;
                const normalizedId = normalizeGroupId(groupId);
                const dbGroup = dbGroupsMap.get(normalizedId);
                const groupInfo = {
                    id: normalizedId,
                    name: chat.name || 'Sin nombre',
                    participants: chat.participants?.length || 0,
                    isReadOnly: chat.isReadOnly || false,
                    dbData: dbGroup || null
                };
                if (dbGroup && dbGroup.isActive) {
                    activeGroups.push(groupInfo);
                }
                else if (dbGroup && !dbGroup.isActive) {
                    inactiveGroups.push(groupInfo);
                }
                else {
                    neverRegisteredGroups.push(groupInfo);
                }
            }
            let response = `📱 *GRUPOS DONDE ESTOY*\n`;
            response += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
            if (activeGroups.length > 0) {
                response += `✅ *BOT ACTIVO* (${activeGroups.length})\n`;
                response += `_El bot responde comandos en estos grupos_\n\n`;
                for (const group of activeGroups) {
                    response += `▸ *${group.name}*\n`;
                    response += `   🆔 _${group.id}_\n`;
                    response += `   👥 ${group.participants} participantes\n`;
                    if (group.dbData?.activatedAt) {
                        response += `   📅 Activo desde: ${formatDate(group.dbData.activatedAt)}\n`;
                    }
                    if (group.dbData?.memberCount) {
                        response += `   📊 ${group.dbData.memberCount} miembros registrados\n`;
                    }
                    response += '\n';
                }
            }
            if (inactiveGroups.length > 0) {
                response += `⏸️ *BOT PAUSADO* (${inactiveGroups.length})\n`;
                response += `_El bot está en estos grupos pero no responde_\n\n`;
                for (const group of inactiveGroups) {
                    response += `▸ *${group.name}*\n`;
                    response += `   🆔 _${group.id}_\n`;
                    response += `   👥 ${group.participants} participantes\n`;
                    if (group.dbData?.deactivatedAt) {
                        response += `   📅 Pausado: ${formatDate(group.dbData.deactivatedAt)}\n`;
                    }
                    response += `   💡 _Usa .bot on en el grupo para activar_\n`;
                    response += '\n';
                }
            }
            if (neverRegisteredGroups.length > 0) {
                response += `⚫ *SIN ACTIVAR* (${neverRegisteredGroups.length})\n`;
                response += `_El bot está en estos grupos pero nunca fue activado_\n\n`;
                for (const group of neverRegisteredGroups) {
                    response += `▸ *${group.name}*\n`;
                    response += `   🆔 _${group.id}_\n`;
                    response += `   👥 ${group.participants} participantes\n`;
                    if (group.isReadOnly) {
                        response += `   🔒 _Grupo de solo lectura_\n`;
                    }
                    response += `   💡 _Usa .bot on en el grupo para activar_\n`;
                    response += '\n';
                }
            }
            response += `━━━━━━━━━━━━━━━━━━━━━\n`;
            response += `📊 *RESUMEN TOTAL*\n\n`;
            response += `   📱 Grupos totales: *${whatsappGroups.length}*\n`;
            response += `   ✅ Bot activo: *${activeGroups.length}*\n`;
            response += `   ⏸️ Bot pausado: *${inactiveGroups.length}*\n`;
            response += `   ⚫ Sin activar: *${neverRegisteredGroups.length}*\n\n`;
            response += `━━━━━━━━━━━━━━━━━━━━━\n`;
            response += `💡 *COMANDOS ÚTILES*\n\n`;
            response += `▸ _.bot on_ - Activar bot en un grupo\n`;
            response += `▸ _.bot off_ - Pausar bot en un grupo\n`;
            response += `▸ _.leave_ - Salir de un grupo`;
            await sock.sendMessage(replyJid, response);
            await msg.react(EMOJIS.SUCCESS);
        }
        catch (error) {
            logger.error('[listgroups] Error:', error);
            await msg.react(EMOJIS.ERROR);
            await sock.sendMessage(replyJid, `❌ Error al obtener la lista de grupos\n\n_${error.message}_`);
        }
    }
};
