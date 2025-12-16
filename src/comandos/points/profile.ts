import MemberRepository from '../../repositories/MemberRepository.js';
import GroupRepository from '../../repositories/GroupRepository.js';
import { normalizePhone } from '../../utils/phone.js';
import { getFirstMention } from '../../utils/parser.js';
import { calculateLevel, getLevelProgress } from '../../utils/levels.js';
import { EMOJIS } from '../../config/constants.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';

export default {
  name: 'profile',
  description: 'Perfil completo de un usuario',
  category: 'general',
  permissions: 'user',
  scope: 'group',
  cooldown: 5,

  async execute({ sock, msg, groupId, userPhone, replyJid }) {
    try {
      await reactLoading(sock, msg);

      const mentionedPhone = getFirstMention(msg);
      const targetPhone = mentionedPhone ? normalizePhone(mentionedPhone) : normalizePhone(userPhone);

      const found = await MemberRepository.findByPhoneOrLid(groupId, targetPhone, targetPhone);
      const member = found ? found.data : null;

      if (!member) {
        await reactError(sock, msg);
        await reply(sock, msg, `${EMOJIS.ERROR} Usuario no encontrado`);
        return;
      }

      const group = await GroupRepository.getById(groupId);
      const groupConfig = await GroupRepository.getConfig(groupId);
      const levels = groupConfig?.levels || group?.config?.levels;

      const points = member.points || 0;
      const level = calculateLevel(points, levels);
      const progress = getLevelProgress(points, levels);
      const rank = await MemberRepository.getRankPosition(groupId, targetPhone);

      let message = `${EMOJIS.USER} *PERFIL DE USUARIO*\n\n`;
      message += `Nombre: ${member.displayName || targetPhone}\n`;
      message += `${EMOJIS.PHONE} Teléfono: ${targetPhone}\n\n`;

      message += `${EMOJIS.TROPHY} *NIVEL Y PUNTOS*\n`;
      message += `${EMOJIS.STAR} Nivel: ${level.level} - ${level.name}\n`;
      message += `${EMOJIS.POINTS} Puntos: ${points}\n`;
      message += `${EMOJIS.CHART} Ranking: #${rank}\n\n`;

      message += `${EMOJIS.MESSAGE} *ESTADÍSTICAS*\n`;
      message += `Mensajes totales: ${member.totalMessagesCount || 0}\n`;
      message += `Advertencias: ${member.warnings || 0}\n`;
      message += `Estado: ${member.isMember ? 'Activo' : 'Inactivo'}\n\n`;

      if (member.stats) {
        message += `${EMOJIS.GIFT} *RECOMPENSAS*\n`;
        message += `Puntos ganados: ${member.stats.totalPointsEarned || 0}\n`;
        message += `Puntos gastados: ${member.stats.totalPointsSpent || 0}\n`;
        message += `Premios canjeados: ${member.stats.totalRewardsRedeemed || 0}\n`;
      }

      await reply(sock, msg, message);
      await reactSuccess(sock, msg);
    } catch (error: any) {
      await reactError(sock, msg);
      await reply(sock, msg, `${EMOJIS.ERROR} Error al obtener perfil`);
    }
  }
};
