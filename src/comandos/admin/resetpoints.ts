import PointsService from '../../services/PointsService.js';
import { EMOJIS } from '../../config/constants.js';
import MemberRepository from '../../repositories/MemberRepository.js';
import { getFirstMention } from '../../utils/parser.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';

export default {
  name: 'resetpoints',
  description: 'Resetear puntos de un usuario',
  category: 'admin',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 5,

  async execute({  sock, msg, groupId, replyJid }) {
    const mentionedPhone = getFirstMention(msg);
    if (!mentionedPhone) {
      await sock.sendMessage(replyJid, formatError('Debes mencionar a un usuario'));
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

      await PointsService.resetPoints(groupId, docId);
      await sock.sendMessage(replyJid, 
        formatSuccess(`Puntos reseteados: ${member?.displayName || normalized} ahora tiene 0 puntos`)
      );
    } catch (error) {
      await sock.sendMessage(replyJid, formatError('Error al resetear puntos'));
    }
  }
};


