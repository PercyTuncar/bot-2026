﻿import MemberRepository from '../../repositories/MemberRepository.js';
import { formatNumber } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
import { bold, numberList, joinSections } from '../../utils/message-builder.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';

export default {
  name: 'leaderboard',
  description: 'Top 10 usuarios con mas puntos',
  category: 'stats',
  permissions: 'user',
  scope: 'group',
  cooldown: 10,

  async execute({ sock, msg, groupId }) {
    try {
      await reactLoading(sock, msg);

      const [topMembers, allMembers] = await Promise.all([
        MemberRepository.getByPoints(groupId, 10),
        MemberRepository.getActiveMembers(groupId)
      ]);

      let items = topMembers.map((member, index) => {
        const medal = index === 0 ? EMOJIS.MEDAL_1 : index === 1 ? EMOJIS.MEDAL_2 : index === 2 ? EMOJIS.MEDAL_3 : '';
        return `${medal} ${member.displayName} - ${formatNumber(member.points || 0)} puntos`;
      });

      const header = `${EMOJIS.TROPHY} ${bold('TOP 10 - LEADERBOARD')}`;
      const body = numberList(items);
      const footer = `\nTotal de participantes: ${allMembers.length}`;

      const response = joinSections([header, body]) + footer;

      await reply(sock, msg, response);
      await reactSuccess(sock, msg);
      logger.info('[LEADERBOARD] Mostrado en grupo ' + groupId);
    } catch (error: any) {
      await reactError(sock, msg);
      await reply(sock, msg, `${EMOJIS.ERROR} Error al obtener el leaderboard`);
      logger.error('[LEADERBOARD] Error:', error);
    }
  }
};
