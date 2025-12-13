import GroupRepository from '../../repositories/GroupRepository.js';
import { EMOJIS } from '../../config/constants.js';
import MemberRepository from '../../repositories/MemberRepository.js';
import MessageRepository from '../../repositories/MessageRepository.js';
import { formatNumber } from '../../utils/formatter.js';

export default {
  name: 'stats',
  description: 'EstadÃ­sticas del grupo',
  category: 'stats',
  permissions: 'user',
  scope: 'group',
  cooldown: 10,

  async execute({ sock, msg, groupId, replyJid }) {
    const group = await GroupRepository.getById(groupId);
    const members = await MemberRepository.getActiveMembers(groupId);
    const totalMessages = await MessageRepository.countByGroup(groupId);
    
    const totalPoints = members.reduce((sum, m) => sum + (m.points || 0), 0);
    const topMembers = members
      .sort((a, b) => (b.points || 0) - (a.points || 0))
      .slice(0, 5);

    let response = `ðŸ“Š ESTADÃSTICAS DEL GRUPO\n\n`;
    response += `ðŸ‘¥ Miembros: ${members.length}\n`;
    response += `ðŸ’¬ Mensajes totales: ${formatNumber(totalMessages)}\n`;
    response += `ðŸŽ¯ Puntos totales: ${formatNumber(totalPoints)}\n\n`;
    response += `ðŸ† TOP 5 MIEMBROS:\n`;
    
    topMembers.forEach((m, i) => {
      response += `${i + 1}. ${m.displayName} - ${m.points || 0} puntos\n`;
    });

    await sock.sendMessage(replyJid, response);
  }
};


