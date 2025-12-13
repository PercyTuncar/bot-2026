import RedemptionHandler from '../../handlers/redemptionHandler.js';
import { formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';
import { EMOJIS } from '../../config/constants.js';
export default {
    name: 'approveredeem',
    aliases: ['aprobar', 'approvecanal'],
    description: 'Aprobar un canje de recompensa (solo admins)',
    category: 'admin',
    permissions: 'admin',
    scope: 'group',
    cooldown: 3,
    enabled: true,
    async execute({ sock, msg, args, groupId, userPhone, replyJid }) {
        const redemptionId = args[0];
        if (!redemptionId) {
            await sock.sendMessage(replyJid, formatError('Debes especificar el ID del canje\n\nUso: .approveredeem {redemptionId}\nEjemplo: .approveredeem redemption_123456'));
            return;
        }
        try {
            const adminName = msg.pushName || userPhone;
            const result = await RedemptionHandler.approveRedemption(groupId, redemptionId, userPhone, adminName);
            if (result.success) {
                let adminMessage = `✅ *CANJE APROBADO*\n\n`;
                adminMessage += `Recompensa: ${result.rewardName}\n`;
                adminMessage += `Usuario: @${result.userPhone}\n`;
                adminMessage += `Puntos descontados: ${result.pointsDeducted.toLocaleString()}\n\n`;
                adminMessage += `📝 *Siguiente paso:* Entregar físicamente y confirmar con:\n`;
                adminMessage += `.deliver ${redemptionId}`;
                await sock.sendMessage(replyJid, adminMessage);
                try {
                    const userMessage = `✅ *TU CANJE FUE APROBADO*\n\n` +
                        `Recompensa: ${result.rewardName}\n` +
                        `Puntos descontados: ${result.pointsDeducted.toLocaleString()}\n` +
                        `Puntos restantes: ${result.newPoints.toLocaleString()}\n\n` +
                        `📍 Acércate con un admin para recoger tu premio`;
                    await sock.sendMessage(`${result.userPhone}@s.whatsapp.net`, userMessage);
                }
                catch (error) {
                    logger.warn('No se pudo notificar al usuario:', error);
                }
                logger.info(`${EMOJIS.SUCCESS} Canje ${redemptionId} aprobado por ${userPhone}`);
            }
        }
        catch (error) {
            logger.error(`${EMOJIS.ERROR} Error al aprobar canje:`, error);
            await sock.sendMessage(replyJid, formatError(error.message || 'Error al aprobar canje'));
        }
    }
};
