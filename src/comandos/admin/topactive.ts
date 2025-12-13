import MemberRepository from '../../repositories/MemberRepository.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';

export default {
  name: 'topactive',
  description: 'Top usuarios mas activos (admin)',
  usage: '.topactive [cantidad]',
  category: 'admin',
  permissions: 'admin',
  scope: 'group',

  async execute({ msg, args, groupId }) {
    const limit = parseInt(args[0]) || 10;

    if (limit < 1 || limit > 50) {
      await msg.reply(EMOJIS.ERROR + ' La cantidad debe estar entre 1 y 50.');
      return;
    }

    try {
      const members = await MemberRepository.getActiveMembers(groupId);

      if (!members || members.length === 0) {
        await msg.reply(EMOJIS.INFO + ' No hay datos de actividad.');
        return;
      }

      // Ordenar por messageCount descendente
      const sortedMembers = members
        .sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0))
        .slice(0, limit);

      let response = EMOJIS.TROPHY + ' *Top ' + limit + ' Mas Activos*\n\n';

      sortedMembers.forEach((member, index) => {
        const medal = index === 0 ? EMOJIS.MEDAL_1 : index === 1 ? EMOJIS.MEDAL_2 : index === 2 ? EMOJIS.MEDAL_3 : '';
        const name = member.displayName || member.pushname || member.phone;
        const msgs = member.messageCount || 0;
        
        response += medal + ' ' + (index + 1) + '. ' + name + '\n';
        response += '   ' + EMOJIS.MESSAGE + ' ' + msgs + ' mensajes\n\n';
      });

      await msg.reply(response);
      logger.info('[TOPACTIVE] Top ' + limit + ' mostrado en grupo ' + groupId);
    } catch (error) {
      logger.error('[TOPACTIVE] Error:', error);
      await msg.reply(EMOJIS.ERROR + ' Error al obtener top activos.');
    }
  }
};
