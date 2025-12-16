import GroupService from '../../services/GroupService.js';
import { normalizeGroupId, groupIdToJid } from '../../utils/phone.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
import { resolveGroupMetadata } from '../../utils/group.js';
import { react, reactLoading, reactSuccess, reactError, reply } from '../../utils/reply.js';
export default {
    name: 'bot',
    description: 'Activar/desactivar bot en el grupo',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'all',
    cooldown: 10,
    async execute({ sock, msg, args, groupId, groupJid, userPhone, replyJid, isDM }) {
        const action = args[0]?.toLowerCase();
        let targetGroupId = groupId;
        let isRemoteActivation = false;
        if (isDM && args[1]) {
            targetGroupId = normalizeGroupId(args[1]);
            isRemoteActivation = true;
        }
        if (!targetGroupId) {
            await reply(sock, msg, `${EMOJIS.ERROR} Debes usar este comando en un grupo o especificar el ID del grupo en DM (ej: .bot on 123456)`);
            return;
        }
        const targetGroupJid = groupIdToJid(targetGroupId);
        if (action === 'on') {
            try {
                await reactLoading(sock, msg);
                const adminPhone = userPhone;
                if (!adminPhone) {
                    throw new Error('No se pudo determinar el teléfono del admin');
                }
                logger.info(`[bot] Activando bot en grupo ${targetGroupId} (jid=${targetGroupJid}) por admin ${adminPhone}`);
                let groupMetadata;
                try {
                    groupMetadata = await resolveGroupMetadata(sock, targetGroupId, isRemoteActivation ? null : msg);
                    if (!groupMetadata)
                        throw new Error('No se pudo acceder a la información del grupo');
                }
                catch (error) {
                    logger.error(`[bot] Error al obtener metadatos del grupo ${targetGroupId}:`, error);
                    throw new Error(`El chat no es un grupo, no existe o el bot no es miembro. Detalles: ${error.message}`);
                }
                const canonicalGroupId = normalizeGroupId(groupMetadata.id) || normalizeGroupId(targetGroupId);
                if (!canonicalGroupId) {
                    throw new Error('No se pudo determinar el ID del grupo.');
                }
                const groupJidForMessage = groupIdToJid(canonicalGroupId);
                logger.info(`[bot] IDs: metadataId="${typeof groupMetadata.id === 'object' ? JSON.stringify(groupMetadata.id) : groupMetadata.id}", canonical="${canonicalGroupId}", jid="${groupJidForMessage}"`);
                const result = await GroupService.activateGroup(canonicalGroupId, groupMetadata, sock);
                if (result.outcome === 'ALREADY_ACTIVE') {
                    if (isRemoteActivation) {
                        await sock.sendMessage(replyJid, { text: `${EMOJIS.WARNING} El bot ya está activo en el grupo ${groupMetadata.subject || canonicalGroupId}` });
                    }
                    else {
                        await sock.sendMessage(groupJidForMessage, { text: `${EMOJIS.WARNING} El bot ya está activo y funcionando` });
                    }
                    await react(sock, msg, EMOJIS.WARNING);
                    return;
                }
                await reactSuccess(sock, msg);
                if (isRemoteActivation) {
                    await sock.sendMessage(replyJid, {
                        text: `${EMOJIS.ROBOT} *Bot Activado (Silencioso)*\n\n` +
                            `✅ El bot se ha activado correctamente en el grupo:\n` +
                            `🏷️ *${groupMetadata.subject || 'Grupo desconocido'}*\n` +
                            `🆔 ${canonicalGroupId}\n\n` +
                            `👥 Participantes: ${groupMetadata.participants?.length || 0}\n` +
                            `🤫 No se envió notificación al grupo.`
                    });
                }
                else {
                    await sock.sendMessage(groupJidForMessage, {
                        text: `${EMOJIS.ROBOT} *Bot Activado*\n\n` +
                            `✅ El bot está ahora activo en este grupo.\n` +
                            ` Total participantes: ${groupMetadata.participants?.length || 0}\n` +
                            `🎯 Sistema de puntos: Activo (1 punto cada 10 mensajes)\n\n` +
                            `Usa .help para ver todos los comandos disponibles.`
                    });
                }
            }
            catch (error) {
                logger.error(`[bot] Error al activar bot en grupo ${targetGroupId}:`, error);
                await reactError(sock, msg);
                await reply(sock, msg, `${EMOJIS.ERROR} Error al activar el bot: ${error.message}`);
            }
        }
        else if (action === 'off') {
            try {
                await reactLoading(sock, msg);
                if (targetGroupId) {
                    await GroupService.deactivateGroup(targetGroupId);
                }
                if (isRemoteActivation) {
                    await sock.sendMessage(replyJid, { text: `✅ Bot desactivado en el grupo ${targetGroupId}` });
                }
                else {
                    await sock.sendMessage(targetGroupJid, {
                        text: `${EMOJIS.ROBOT} Bot desactivado\nEl bot ya no guardará mensajes ni responderá comandos (excepto .bot on)`
                    });
                }
                await reactSuccess(sock, msg);
            }
            catch (error) {
                await reactError(sock, msg);
                await reply(sock, msg, `${EMOJIS.ERROR} Error al desactivar el bot: ${error.message}`);
            }
        }
        else {
            await reply(sock, msg, `*Uso:* .bot on/off [ID_GRUPO]\n\n` +
                `• *on* - Activa el bot (en el grupo actual o ID especificado)\n` +
                `• *off* - Desactiva el bot\n\n` +
                `_Ejemplo remoto:_ .bot on 120363199955210379`);
        }
    }
};
