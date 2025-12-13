import PointsService from '../../services/PointsService.js';
import { EMOJIS } from '../../config/constants.js';
import MemberRepository from '../../repositories/MemberRepository.js';
import { getFirstMention } from '../../utils/parser.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';

export default {
  name: 'setpoints',
  description: 'Establecer puntos de un usuario',
  category: 'admin',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 5,

  async execute({ sock, msg, args, groupId, replyJid }) {
    const mentionedPhone = getFirstMention(msg);
    if (!mentionedPhone) {
      await sock.sendMessage(replyJid, formatError('Debes mencionar a un usuario'));
      return;
    }

    const points = parseInt(args[1]);
    if (isNaN(points) || points < 0) {
      await sock.sendMessage(replyJid, formatError('Debes especificar una cantidad válida de puntos'));
      return;
    }

    try {
      const normalized = normalizePhone(mentionedPhone);
      const found = await MemberRepository.findByPhoneOrLid(groupId, normalized, normalized);
      const member = found ? found.data : null;
      const docId = found?.docId || normalized;

      if (!member) {
        await sock.sendMessage(replyJid, formatError('Usuario no encontrado'));
        return;
      }

      await PointsService.setPoints(groupId, docId, points);
      await sock.sendMessage(replyJid, 
        formatSuccess(`Puntos establecidos: ${member?.displayName || normalized} ahora tiene ${points} puntos`)
      );
    } catch (error) {
      await sock.sendMessage(replyJid, formatError('Error al establecer puntos'));
    }
  }
};


