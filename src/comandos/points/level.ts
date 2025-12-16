import MemberRepository from '../../repositories/MemberRepository.js';
import GroupRepository from '../../repositories/GroupRepository.js';
import { normalizePhone } from '../../utils/phone.js';
import { getLevelProgress, formatProgressBar } from '../../utils/levels.js';
import { EMOJIS } from '../../config/constants.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';

export default {
  name: 'level',
  description: 'Muestra tu nivel y progreso actual',
  category: 'general',
  permissions: 'user',
  scope: 'group',
  cooldown: 5,

  async execute({ sock, msg, groupId, userPhone, replyJid }) {
    try {
      await reactLoading(sock, msg);

      const found = await MemberRepository.findByPhoneOrLid(groupId, userPhone, userPhone);
      const member = found ? found.data : null;

      if (!member) {
        await reactError(sock, msg);
        await reply(sock, msg, `${EMOJIS.ERROR} No tienes datos registrados aún`);
        return;
      }

      const points = member.points || 0;
      const group = await GroupRepository.getById(groupId);
      const groupConfig = await GroupRepository.getConfig(groupId);
      const levels = groupConfig?.levels || group?.config?.levels;

      const progress = getLevelProgress(points, levels);
      const progressBar = formatProgressBar(progress.progress);

      let message = `${EMOJIS.TROPHY} *TU NIVEL*\n\n`;
      message += `${EMOJIS.USER} Usuario: ${member.displayName || userPhone}\n`;
      message += `${EMOJIS.STAR} Nivel actual: ${progress.current.level} - ${progress.current.name}\n`;
      message += `${EMOJIS.POINTS} Puntos: ${points}\n\n`;

      if (progress.isMaxLevel) {
        message += `${EMOJIS.CROWN} ¡Nivel máximo alcanzado!\n`;
      } else {
        message += `${EMOJIS.CHART} Progreso al siguiente nivel:\n`;
        message += `${progressBar} ${progress.progress}%\n\n`;
        message += `Próximo nivel: ${progress.next.level} - ${progress.next.name}\n`;
        message += `Necesitas: ${progress.pointsToNext} puntos más\n`;
      }

      await reply(sock, msg, message);
      await reactSuccess(sock, msg);
    } catch (error: any) {
      await reactError(sock, msg);
      await reply(sock, msg, `${EMOJIS.ERROR} Error al obtener nivel`);
    }
  }
};
