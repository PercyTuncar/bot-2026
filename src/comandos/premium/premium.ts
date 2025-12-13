import { getFirestore } from '../../config/firebase.js';
import { normalizeGroupId } from '../../utils/phone.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';
import { EMOJIS } from '../../config/constants.js';

export default {
  name: 'premium',
  description: 'Lista de comandos premium disponibles',
  category: 'premium',
  permissions: 'user',
  scope: 'group',
  cooldown: 10,
  enabled: true,

  async execute({ sock, msg, groupId, userPhone, replyJid }) {
    try {
      const db = getFirestore();
      const normalized = normalizeGroupId(groupId);
      
      // Obtener comandos premium disponibles
      const commandsSnapshot = await db.collection('groups')
        .doc(normalized)
        .collection('premium_commands')
        .where('isAvailable', '==', true)
        .get();
      
      // Obtener puntos del usuario
      const memberDoc = await db.collection('groups')
        .doc(normalized)
        .collection('members')
        .doc(userPhone)
        .get();
      
      const memberData = memberDoc.exists ? memberDoc.data() : {};
      const userPoints = memberData.points || 0;
      const userPremiumCommands = memberData.premiumCommands || [];
      
      // Obtener configuración del grupo para nombre de puntos
      const groupDoc = await db.collection('groups').doc(normalized).get();
      const groupData = groupDoc.data() || {};
      const pointsName = groupData.config?.pointsName || 'RaveCoins';
      const pointsEmoji = groupData.config?.pointsEmoji || '💎';
      
      if (commandsSnapshot.empty) {
        await sock.sendMessage(replyJid, formatError('No hay comandos premium disponibles en este grupo'));
        return;
      }
      
      let message = `📱 *COMANDOS PREMIUM DISPONIBLES*\n\n`;
      
      const commands = commandsSnapshot.docs.map(doc => doc.data());
      let index = 1;
      
      for (const cmd of commands) {
        const hasCommand = userPremiumCommands.some(uc => uc.commandName === cmd.commandName);
        const canAfford = userPoints >= cmd.price;
        
        let statusEmoji = '';
        let statusText = '';
        
        if (hasCommand) {
          statusEmoji = '✅';
          statusText = 'Ya lo tienes';
        } else if (canAfford) {
          statusEmoji = '✅';
          statusText = 'Disponible';
        } else {
          statusEmoji = '❌';
          statusText = `Te faltan ${cmd.price - userPoints} puntos`;
        }
        
        message += `${index}️⃣ ${cmd.displayName || cmd.commandName} ${cmd.emoji || '📦'}\n`;
        message += `   • Comando: ${cmd.commandName}\n`;
        message += `   • Costo: ${cmd.price.toLocaleString()} ${pointsEmoji} ${pointsName}\n`;
        if (cmd.description) {
          message += `   • Descripción: ${cmd.description}\n`;
        }
        message += `   • Estado: ${statusEmoji} ${statusText}\n\n`;
        
        index++;
      }
      
      message += `💰 *Tus puntos:* ${userPoints.toLocaleString()} ${pointsName}\n`;
      message += `📝 *Para comprar:* .buypremium {comando}\n`;
      
      if (userPremiumCommands.length > 0) {
        message += `\n✨ *Comandos que ya tienes:* ${userPremiumCommands.length}\n`;
        message += `📋 Ver mis comandos: .mypremium`;
      }
      
      await sock.sendMessage(replyJid, message);
      logger.info(`${EMOJIS.SUCCESS} Comandos premium listados para ${userPhone}`);
      
    } catch (error) {
      logger.error(`${EMOJIS.ERROR} Error en comando premium:`, error);
      await sock.sendMessage(replyJid, formatError('Error al obtener comandos premium'));
    }
  }
};
