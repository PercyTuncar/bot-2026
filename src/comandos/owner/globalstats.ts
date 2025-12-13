import { getFirestore } from '../../config/firebase.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';
import { EMOJIS } from '../../config/constants.js';
import GroupRepository from '../../repositories/GroupRepository.js';

export default {
  name: 'globalstats',
  aliases: ['estadisticasglobales', 'gstats'],
  description: 'Estadísticas globales del bot (solo owner)',
  category: 'owner',
  permissions: 'owner',
  scope: 'dm',
  cooldown: 10,
  enabled: true,

  async execute({ sock, msg, replyJid }) {
    try {
      await msg.react(EMOJIS.LOADING);
      const db = getFirestore();
      
      await sock.sendMessage(replyJid, `${EMOJIS.LOADING} Calculando estadísticas globales...`);
      
      // Obtener todos los grupos
      const groups = await GroupRepository.getAll();
      
      const activeGroups = groups.filter(g => g.isActive);
      
      // Calcular totales
      let totalUsers = 0;
      let totalMessages = 0;
      let totalPoints = 0;
      let totalCommands = 0;
      let totalPremiumPurchased = 0;
      let totalRedemptions = 0;
      
      for (const group of groups) {
        totalMessages += group.totalMessages || 0;
        totalPoints += group.totalPoints || 0;
        totalCommands += group.totalCommandsExecuted || 0;
        totalPremiumPurchased += group.totalPremiumCommandsPurchased || 0;
        totalRedemptions += group.totalRedemptions || 0;
        totalUsers += group.memberCount || 0;
      }
      
      // Top 3 grupos más activos
      const topGroups = [...groups]
        .sort((a, b) => (b.totalMessages || 0) - (a.totalMessages || 0))
        .slice(0, 3);
      
      // Obtener configuración global
      const globalConfigDoc = await db.collection('bot_config').doc('settings').get();
      const globalConfig = globalConfigDoc.exists ? globalConfigDoc.data() : {};
      
      let message = `🌐 *ESTADÍSTICAS GLOBALES DEL BOT*\n\n`;
      
      message += `📊 *Resumen General*\n`;
      message += `• Grupos: ${groups.length} totales (${activeGroups.length} activos)\n`;
      message += `• Usuarios: ${totalUsers.toLocaleString()} únicos\n`;
      message += `• Mensajes: ${totalMessages.toLocaleString()} procesados\n`;
      message += `• Puntos: ${totalPoints.toLocaleString()} distribuidos\n`;
      message += `• Comandos: ${totalCommands.toLocaleString()} ejecutados\n`;
      message += `• Premium: ${totalPremiumPurchased} comandos comprados\n`;
      message += `• Canjes: ${totalRedemptions} recompensas entregadas\n\n`;
      
      if (topGroups.length > 0) {
        message += `🏆 *Top Grupos Más Activos*\n`;
        topGroups.forEach((group, index) => {
          message += `${index + 1}️⃣ ${group.name || 'Sin nombre'} (${(group.totalMessages || 0).toLocaleString()} mensajes)\n`;
        });
        message += `\n`;
      }
      
      message += `✅ *Sistema*\n`;
      message += `• Versión: ${globalConfig.version || '1.0.0'}\n`;
      message += `• Estado: Operando correctamente\n`;
      
      if (globalConfig.lastConnection) {
        const lastConn = new Date(globalConfig.lastConnection.toDate());
        message += `• Última conexión: ${lastConn.toLocaleString()}\n`;
      }
      
      await sock.sendMessage(replyJid, message);
      await msg.react(EMOJIS.SUCCESS);
      logger.info(`${EMOJIS.SUCCESS} Estadísticas globales enviadas`);
      
    } catch (error) {
      logger.error(`${EMOJIS.ERROR} Error al obtener estadísticas globales:`, error);
      await msg.react(EMOJIS.ERROR);
      await sock.sendMessage(replyJid, formatError('Error al calcular estadísticas globales'));
    }
  }
};
