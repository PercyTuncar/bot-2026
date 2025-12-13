import MemberRepository from '../../repositories/MemberRepository.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';

export default {
  name: 'taginactive',
  description: 'Mencionar usuarios inactivos por X días',
  category: 'admin',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 30,

  async execute({ sock, msg, args, groupId, replyJid }) {
    try {
      await msg.react(EMOJIS.LOADING);
      await sock.sendMessage(replyJid, `${EMOJIS.LOADING} Buscando usuarios inactivos...`);
      const days = parseInt(args[0]);
      
      if (isNaN(days) || days < 1) {
        await sock.sendMessage(replyJid, formatError('Debes especificar un número válido de días\nEjemplo: .taginactive 7'));
        return;
      }

      const members = await MemberRepository.getActiveMembers(groupId);
      const now = Date.now();
      const daysInMs = days * 24 * 60 * 60 * 1000;

      const inactiveMembers = members.filter(m => {
        if (!m.lastMessageAt) return true;
        const lastMessageTime = (val: any) => {
          if (val.toDate) return val.toDate().getTime();
          if (typeof val === 'string') return new Date(val).getTime();
          return val;
        };
        const lastMessage = lastMessageTime(m.lastMessageAt);
        return (now - lastMessage) > daysInMs;
      });

      if (inactiveMembers.length === 0) {
        await sock.sendMessage(replyJid, formatError(`No hay usuarios inactivos por más de ${days} días`));
        return;
      }

      const mentions = inactiveMembers.slice(0, 100).map(m => m.phone + '@s.whatsapp.net');

      let text = `${EMOJIS.WARNING} *USUARIOS INACTIVOS*\n\n`;
      text += `Usuarios sin actividad por más de ${days} días:\n\n`;
      
      inactiveMembers.slice(0, 100).forEach((member, index) => {
        text += `@${member.phone} `;
        if ((index + 1) % 5 === 0) text += '\n';
      });

      text += `\n\n${EMOJIS.INFO} Total: ${inactiveMembers.length} usuarios`;

      await sock.sendMessage(replyJid, text, { mentions });
      await msg.react(EMOJIS.SUCCESS);
      
      logger.info(`Taginactive ejecutado en grupo ${groupId} - ${inactiveMembers.length} inactivos`);
    } catch (error) {
      logger.error('Error in taginactive command:', error);
      await msg.react(EMOJIS.ERROR);
      await sock.sendMessage(replyJid, formatError('Error al mencionar inactivos'));
    }
  }
};
