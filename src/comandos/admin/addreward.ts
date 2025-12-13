import { getFirestore } from '../../config/firebase.js';
import { normalizeGroupId } from '../../utils/phone.js';
import { getNow } from '../../utils/time.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';
import { EMOJIS } from '../../config/constants.js';

export default {
  name: 'addreward',
  aliases: ['createreward', 'nuevarecompensa'],
  description: 'Crear una recompensa física (solo admins)',
  category: 'admin',
  permissions: 'admin',
  scope: 'group',
  cooldown: 5,
  enabled: true,

  async execute({ sock, msg, args, groupId, userPhone, replyJid }) {
    // Uso: .addreward {nombre} {costo} {stock} {descripción}
    // Ejemplo: .addreward "Cerveza Corona" 3000 50 Cerveza Corona 355ml bien fría 🍺
    
    if (args.length < 4) {
      await sock.sendMessage(replyJid, 
        formatError('Uso incorrecto\n\n') +
        'Uso: .addreward {nombre} {costo} {stock} {descripción}\n\n' +
        'Ejemplo: .addreward "Cerveza Corona" 3000 50 Cerveza Corona 355ml bien fría 🍺\n\n' +
        'Stock: Usa -1 para ilimitado'
      );
      return;
    }
    
    const name = args[0];
    const cost = parseInt(args[1]);
    const stock = parseInt(args[2]);
    const description = args.slice(3).join(' ');
    
    if (isNaN(cost) || cost < 0) {
      await sock.sendMessage(replyJid, formatError('El costo debe ser un número válido mayor o igual a 0'));
      return;
    }
    
    if (isNaN(stock) || (stock < -1)) {
      await sock.sendMessage(replyJid, formatError('El stock debe ser un número válido (-1 para ilimitado)'));
      return;
    }
    
    try {
      const db = getFirestore();
      const normalized = normalizeGroupId(groupId);
      
      // Extraer emoji si está en la descripción
      const emojiMatch = description.match(/[\u{1F300}-\u{1F9FF}]/u);
      const emoji = emojiMatch ? emojiMatch[0] : '🎁';
      
      // Generar ID único
      const rewardId = `reward_${Date.now()}`;
      
      // Crear recompensa
      const rewardData = {
        rewardId,
        name,
        description: description.replace(emoji, '').trim(),
        imageUrl: '',
        emoji,
        category: 'general',
        cost,
        stock,
        isActive: true,
        requiresDelivery: true,
        totalRedeemed: 0,
        totalPending: 0,
        totalApproved: 0,
        totalDelivered: 0,
        createdAt: getNow(),
        updatedAt: getNow(),
        createdBy: userPhone
      };
      
      await db.collection('groups')
        .doc(normalized)
        .collection('rewards')
        .doc(rewardId)
        .set(rewardData);
      
      let response = `✅ *RECOMPENSA CREADA*\n\n`;
      response += `${emoji} ${name}\n`;
      response += `ID: ${rewardId}\n`;
      response += `Costo: ${cost.toLocaleString()} puntos\n`;
      response += `Stock: ${stock === -1 ? 'Ilimitado' : stock}\n`;
      response += `Descripción: ${rewardData.description}\n\n`;
      response += `Los usuarios podrán canjearla con:\n`;
      response += `.redeem ${rewardId}`;
      
      await sock.sendMessage(replyJid, response);
      logger.info(`${EMOJIS.SUCCESS} Recompensa "${name}" creada por ${userPhone}`);
      
    } catch (error) {
      logger.error(`${EMOJIS.ERROR} Error al crear recompensa:`, error);
      await sock.sendMessage(replyJid, formatError('Error al crear recompensa'));
    }
  }
};
