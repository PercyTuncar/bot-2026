import PremiumHandler from '../../handlers/premiumHandler.js';
import { formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';
import { EMOJIS } from '../../config/constants.js';
export default {
    name: 'buypremium',
    aliases: ['comprarpremium', 'buycommand'],
    description: 'Comprar un comando premium',
    category: 'premium',
    permissions: 'user',
    scope: 'group',
    cooldown: 5,
    enabled: true,
    async execute({ sock, msg, args, groupId, userPhone, replyJid }) {
        const commandName = args[0]?.toLowerCase();
        if (!commandName) {
            await sock.sendMessage(replyJid, formatError('Debes especificar el nombre del comando\n\nUso: .buypremium {comando}\nEjemplo: .buypremium igdownload'));
            return;
        }
        try {
            const userName = msg.pushName || userPhone;
            const result = await PremiumHandler.purchaseCommand(groupId, userPhone, userName, commandName);
            if (result.success) {
                let message = `✅ *COMANDO COMPRADO*\n\n`;
                message += `Has adquirido: ${result.commandDisplayName} 📸\n\n`;
                message += `💎 Puntos gastados: ${result.pointsSpent.toLocaleString()}\n`;
                message += `💎 Puntos restantes: ${result.pointsRemaining.toLocaleString()}\n\n`;
                message += `📝 Ahora puedes usar: .${commandName} {parámetros}\n`;
                message += `✨ Este comando es tuyo para siempre`;
                await sock.sendMessage(replyJid, message);
                logger.info(`${EMOJIS.SUCCESS} Usuario ${userPhone} compró comando premium "${commandName}"`);
            }
        }
        catch (error) {
            logger.error(`${EMOJIS.ERROR} Error al comprar comando premium:`, error);
            await sock.sendMessage(replyJid, formatError(error.message || 'Error al comprar comando premium'));
        }
    }
};
