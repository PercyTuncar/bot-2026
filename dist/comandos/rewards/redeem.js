import RedemptionHandler from '../../handlers/redemptionHandler.js';
import { formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';
import { EMOJIS } from '../../config/constants.js';
export default {
    name: 'redeem',
    aliases: ['canjear', 'claim'],
    description: 'Canjear una recompensa física',
    category: 'rewards',
    permissions: 'user',
    scope: 'group',
    cooldown: 10,
    enabled: true,
    async execute({ sock, msg, args, groupId, groupJid, userPhone, replyJid, member }) {
        const rewardId = args[0];
        if (!rewardId) {
            await sock.sendMessage(replyJid, formatError('Debes especificar el ID de la recompensa\n\nUso: .redeem {rewardId}\n\nUsa .rewards para ver las recompensas disponibles'));
            return;
        }
        const userNotes = args.slice(1).join(' ');
        try {
            const userName = msg.pushName || userPhone;
            const canonicalPhone = member ? (member.phone || member.id) : userPhone;
            const result = await RedemptionHandler.requestRedemption(groupId, canonicalPhone, userName, rewardId, userNotes);
            let message = `✅ *SOLICITUD ENVIADA*\n\n`;
            message += `Has solicitado: ${result.rewardName} ${result.emoji || '🎁'}\n`;
            message += `Costo: ${result.pointsCost.toLocaleString()} puntos\n\n`;
            message += `⏳ Estado: Pendiente de aprobación\n`;
            message += `💡 Tus puntos AÚN NO se han descontado\n`;
            message += `📋 Un admin revisará tu solicitud\n\n`;
            message += `ID de solicitud: ${result.redemptionId}\n\n`;
            message += `Para ver tus canjes: .myredemptions`;
            await sock.sendMessage(replyJid, message);
            try {
                const targetJid = groupJid || (groupId.includes('@') ? groupId : `${groupId}@g.us`);
                const chat = await sock.getChatById(targetJid);
                if (chat && chat.isGroup) {
                    const participants = chat.participants || [];
                    const admins = participants.filter(p => p.isAdmin || p.isSuperAdmin);
                    let adminMessage = `📢 *NUEVA SOLICITUD DE CANJE*\n\n` +
                        `Usuario: @${userPhone} (${userName})\n` +
                        `Recompensa: ${result.rewardName}\n` +
                        `Costo: ${result.pointsCost.toLocaleString()} puntos\n` +
                        `ID: ${result.redemptionId}\n\n`;
                    if (userNotes) {
                        adminMessage += `📝 Notas del usuario: ${userNotes}\n\n`;
                    }
                    adminMessage += `Para aprobar: .approveredeem ${result.redemptionId}\n`;
                    adminMessage += `Para rechazar: .rejectredeem ${result.redemptionId} {razón}`;
                    await sock.sendMessage(targetJid, adminMessage, {
                        mentions: admins.map(a => a.id._serialized)
                    });
                }
            }
            catch (error) {
                logger.warn('No se pudo notificar a los admins:', error);
            }
            logger.info(`${EMOJIS.SUCCESS} Canje solicitado por ${userPhone}: ${rewardId}`);
        }
        catch (error) {
            logger.error(`${EMOJIS.ERROR} Error al solicitar canje:`, error);
            await sock.sendMessage(replyJid, formatError(error.message || 'Error al solicitar canje'));
        }
    }
};
