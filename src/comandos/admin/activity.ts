import MemberRepository from '../../repositories/MemberRepository.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';

export default {
  name: 'activity',
  description: 'Ver actividad del grupo (admin)',
  usage: '.activity',
  category: 'admin',
  permissions: 'admin',
  scope: 'group',

  async execute({ msg, groupId }) {
    try {
      const members = await MemberRepository.getActiveMembers(groupId);

      if (!members || members.length === 0) {
        await msg.reply(EMOJIS.INFO + ' No hay miembros activos registrados.');
        return;
      }

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      let activeToday = 0;
      let activeWeek = 0;
      let totalMessages = 0;

      members.forEach(member => {
        totalMessages += member.messageCount || 0;
        
        if (member.lastMessageAt) {
          // Manejar tanto string ISO como Firestore Timestamp
          const lastMsgValue = member.lastMessageAt as any;
          const lastMsg = lastMsgValue.toDate ? lastMsgValue.toDate() : new Date(lastMsgValue);
          if (lastMsg >= today) activeToday++;
          if (lastMsg >= weekAgo) activeWeek++;
        }
      });

      const avgMessages = members.length > 0 ? Math.round(totalMessages / members.length) : 0;

      let response = EMOJIS.CHART + ' *Actividad del Grupo*\n\n';
      response += EMOJIS.USER + ' Miembros totales: ' + members.length + '\n';
      response += EMOJIS.SUCCESS + ' Activos hoy: ' + activeToday + '\n';
      response += EMOJIS.CALENDAR + ' Activos esta semana: ' + activeWeek + '\n';
      response += EMOJIS.MESSAGE + ' Total mensajes: ' + totalMessages + '\n';
      response += EMOJIS.STAR + ' Promedio por miembro: ' + avgMessages + '\n';

      await msg.reply(response);
      logger.info('[ACTIVITY] Estadisticas mostradas para grupo ' + groupId);
    } catch (error) {
      logger.error('[ACTIVITY] Error:', error);
      await msg.reply(EMOJIS.ERROR + ' Error al obtener actividad del grupo.');
    }
  }
};
