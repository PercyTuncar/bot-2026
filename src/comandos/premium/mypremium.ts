import PremiumHandler from '../../handlers/premiumHandler.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';
import { EMOJIS } from '../../config/constants.js';

export default {
  name: 'mypremium',
  aliases: ['mycommands', 'mispremium'],
  description: 'Ver mis comandos premium comprados',
  category: 'premium',
  permissions: 'user',
  scope: 'group',
  cooldown: 10,
  enabled: true,

  async execute({ sock, msg, groupId, userPhone, replyJid }) {
    try {
      const premiumCommands = await PremiumHandler.getUserPremiumCommands(groupId, userPhone);
      
      if (premiumCommands.length === 0) {
        await sock.sendMessage(replyJid, 
          `📦 *MIS COMANDOS PREMIUM*\n\n` +
          `Aún no has comprado ningún comando premium.\n\n` +
          `💡 Usa .premium para ver los comandos disponibles`
        );
        return;
      }
      
      let message = `✨ *MIS COMANDOS PREMIUM*\n\n`;
      message += `Total de comandos: ${premiumCommands.length}\n\n`;
      
      for (let i = 0; i < premiumCommands.length; i++) {
        const cmd = premiumCommands[i];
        message += `${i + 1}️⃣ *${cmd.commandName}*\n`;
        message += `   • Comprado: ${new Date(cmd.purchasedAt?.toDate()).toLocaleDateString()}\n`;
        message += `   • Veces usado: ${cmd.timesUsed || 0}\n`;
        
        if (cmd.lastUsedAt) {
          message += `   • Último uso: ${new Date(cmd.lastUsedAt.toDate()).toLocaleDateString()}\n`;
        }
        
        message += `\n`;
      }
      
      message += `💡 *Tip:* Estos comandos son tuyos para siempre`;
      
      await sock.sendMessage(replyJid, message);
      logger.info(`${EMOJIS.SUCCESS} Usuario ${userPhone} consultó sus comandos premium`);
      
    } catch (error) {
      logger.error(`${EMOJIS.ERROR} Error al obtener comandos premium del usuario:`, error);
      await sock.sendMessage(replyJid, formatError('Error al obtener tus comandos premium'));
    }
  }
};
