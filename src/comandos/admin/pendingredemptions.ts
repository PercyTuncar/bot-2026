import RedemptionHandler from '../../handlers/redemptionHandler.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';
import { EMOJIS } from '../../config/constants.js';

export default {
  name: 'pendingredemptions',
  aliases: ['canjespendientes', 'pendingrewards'],
  description: 'Ver canjes pendientes (solo admins)',
  category: 'admin',
  permissions: 'admin',
  scope: 'group',
  cooldown: 10,
  enabled: true,

  async execute({ sock, groupId, replyJid }) {
    try {
      const pending = await RedemptionHandler.getPendingRedemptions(groupId);
      
      if (pending.length === 0) {
        await sock.sendMessage(replyJid, 
          `⏳ *CANJES PENDIENTES*\n\n` +
          `No hay canjes pendientes de aprobación.\n\n` +
          `✅ Todo al día`
        );
        return;
      }
      
      let message = `⏳ *CANJES PENDIENTES*\n\n`;
      message += `Total: ${pending.length}\n\n`;
      
      for (let i = 0; i < Math.min(pending.length, 10); i++) {
        const redemption = pending[i];
        const requestedAt = redemption.requestedAt as any;
        const requestedDate = requestedAt.toDate ? requestedAt.toDate() : new Date(requestedAt);
        const timeAgo = getTimeAgo(requestedDate);
        
        message += `${i + 1}️⃣ ${redemption.rewardName} ${redemption.emoji || '🎁'}\n`;
        message += `   • ID: ${redemption.redemptionId}\n`;
        message += `   • Usuario: @${redemption.userPhone}\n`;
        message += `   • Costo: ${redemption.pointsCost.toLocaleString()} puntos\n`;
        message += `   • Solicitado: ${timeAgo}\n`;
        
        if (redemption.userNotes) {
          message += `   • Notas: ${redemption.userNotes}\n`;
        }
        
        message += `\n`;
      }
      
      if (pending.length > 10) {
        message += `... y ${pending.length - 10} más\n\n`;
      }
      
      message += `📝 *Acciones:*\n`;
      message += `• Aprobar: .approveredeem {ID}\n`;
      message += `• Rechazar: .rejectredeem {ID} {razón}`;
      
      await sock.sendMessage(replyJid, message);
      logger.info(`${EMOJIS.SUCCESS} Canjes pendientes listados`);
      
    } catch (error) {
      logger.error(`${EMOJIS.ERROR} Error al obtener canjes pendientes:`, error);
      await sock.sendMessage(replyJid, formatError('Error al obtener canjes pendientes'));
    }
  }
};

function getTimeAgo(date) {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000); // segundos
  
  if (diff < 60) return 'Hace menos de 1 minuto';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} minutos`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} horas`;
  return `Hace ${Math.floor(diff / 86400)} días`;
}
