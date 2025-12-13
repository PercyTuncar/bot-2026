import PointsRepository from '../../repositories/PointsRepository.js';
import MemberRepository from '../../repositories/MemberRepository.js';
import { getTargetUser } from '../../utils/parser.js';
import { getCanonicalId } from '../../utils/phone.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
export default {
    name: 'removepoints',
    description: 'Quitar puntos a un usuario',
    category: 'admin',
    permissions: 'group_admin',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, msg, args, groupId, replyJid }) {
        const target = await getTargetUser(msg, await msg.getChat());
        if (!target) {
            await sock.sendMessage(replyJid, formatError('Debes mencionar a un usuario o responder a su mensaje'));
            return;
        }
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0) {
            await sock.sendMessage(replyJid, formatError('Debes especificar una cantidad válida\nEjemplo: .removepoints @usuario 50'));
            return;
        }
        try {
            const targetPhone = target.phone;
            const targetJid = target.jid;
            let canonicalPhone = targetPhone;
            try {
                if (target.isLid) {
                    const resolved = await getCanonicalId(sock, targetJid);
                    if (resolved && resolved.includes('@c.us')) {
                        canonicalPhone = resolved.replace('@c.us', '');
                    }
                }
            }
            catch (e) { }
            const found = await MemberRepository.findByPhoneOrLid(groupId, canonicalPhone, targetPhone);
            const member = found ? found.data : null;
            const docId = found?.docId || canonicalPhone;
            if (!member) {
                await sock.sendMessage(replyJid, formatError('Usuario no encontrado'));
                return;
            }
            await PointsRepository.addPoints(groupId, docId, -amount);
            const newPoints = Math.max(0, (member.points || 0) - amount);
            const mentionId = targetJid.includes('@') ? targetJid : `${targetPhone}@s.whatsapp.net`;
            await sock.sendMessage(replyJid, formatSuccess(`${EMOJIS.POINTS} Se quitaron ${amount} puntos a @${targetPhone}\n\nTotal: ${newPoints} puntos`), { mentions: [mentionId] });
            logger.info(`${amount} puntos quitados a ${docId} en grupo ${groupId}`);
        }
        catch (error) {
            logger.error('Error in removepoints command:', error);
            await sock.sendMessage(replyJid, formatError('Error al quitar puntos'));
        }
    }
};
