import PointsRepository from '../../repositories/PointsRepository.js';
import MemberRepository from '../../repositories/MemberRepository.js';
import { getTargetUser } from '../../utils/parser.js';
import { normalizePhone, getCanonicalId } from '../../utils/phone.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';

export default {
  name: 'addpoints',
  description: 'Agregar puntos a un usuario',
  category: 'admin',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 5,

  async execute({ sock, msg, args, groupId, replyJid }) {
    // Usar getTargetUser para soportar LIDs y menciones robustas
    const target = await getTargetUser(msg, await msg.getChat());
    
    if (!target) {
      await sock.sendMessage(replyJid, formatError('Debes mencionar a un usuario o responder a su mensaje'));
      return;
    }

    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0) {
      await sock.sendMessage(replyJid, formatError('Debes especificar una cantidad válida\nEjemplo: .addpoints @usuario 100'));
      return;
    }

    try {
      const targetPhone = target.phone;
      const targetJid = target.jid;
      
      // Resolver canonical ID para asegurar que usamos el teléfono real
      let canonicalPhone = targetPhone;
      try {
          // Intentar resolver usando getCanonicalId si es un LID
          if (target.isLid) {
             const resolved = await getCanonicalId(sock, targetJid);
             if (resolved && resolved.includes('@c.us')) {
                 canonicalPhone = resolved.replace('@c.us', '');
             }
          }
      } catch (e) {}

      const found = await MemberRepository.findByPhoneOrLid(groupId, canonicalPhone, targetPhone);
      const member = found ? found.data : null;
      const docId = found?.docId || canonicalPhone;

      if (!member) {
        await sock.sendMessage(replyJid, formatError('Usuario no encontrado'));
        return;
      }

      await PointsRepository.addPoints(groupId, docId, amount);
      
      const newPoints = (member.points || 0) + amount;

      // Usar el ID original para la mención visual (si es LID, WhatsApp lo necesita así)
      const mentionId = targetJid.includes('@') ? targetJid : `${targetPhone}@s.whatsapp.net`;

      await sock.sendMessage(replyJid,
        formatSuccess(`${EMOJIS.POINTS} Se agregaron ${amount} puntos a @${targetPhone}\n\nTotal: ${newPoints} puntos`),
        { mentions: [mentionId] }
      );

      logger.info(`${amount} puntos agregados a ${docId} en grupo ${groupId}`);
    } catch (error) {
      logger.error('Error in addpoints command:', error);
      await sock.sendMessage(replyJid, formatError('Error al agregar puntos'));
    }
  }
};
