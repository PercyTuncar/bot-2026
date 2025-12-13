import MemberRepository from '../../repositories/MemberRepository.js';
import GroupRepository from '../../repositories/GroupRepository.js';
import { EMOJIS } from '../../config/constants.js';
import { normalizePhone } from '../../utils/phone.js';
import { config } from '../../config/environment.js';
import { bold, bulletList, joinSections, section } from '../../utils/message-builder.js';
import { reply } from '../../utils/reply.js';

export default {
  name: 'mypoints',
  description: 'Ver tus puntos actuales',
  category: 'general',
  permissions: 'user',
  scope: 'group',
  cooldown: 5,

  async execute({ sock, msg, groupId, userPhone, replyJid, member: contextMember }) {
    // Si ya tenemos el miembro del contexto (resuelto por dispatcher), usarlo
    // Si no, buscarlo (aunque dispatcher debería haberlo pasado)
    let member = contextMember;
    
    if (!member) {
        const found = await MemberRepository.findByPhoneOrLid(groupId, userPhone, userPhone);
        member = found ? found.data : null;
    }

    if (!member) {
      await reply(sock, msg, joinSections([`${EMOJIS.ERROR} ${bold('No estás registrado en este grupo')}`]));
      return;
    }

    const points = member.points || 0;
    const messages = member.messageCount || 0;
    const messagesForNext = member.messagesForNextPoint || 0;
    
    // Obtener configuración del grupo para messagesPerPoint
    const groupConfig = await GroupRepository.getConfig(groupId);
    const group = await GroupRepository.getById(groupId);
    const messagesPerPoint = groupConfig?.messagesPerPoint 
      || groupConfig?.points?.perMessages 
      || group?.config?.messagesPerPoint
      || group?.config?.points?.perMessages
      || config.points.perMessages;
    const pointsName = groupConfig?.pointsName || group?.config?.points?.name || config.points.name;
    
    const messagesNeeded = Math.max(0, messagesPerPoint - messagesForNext);

    const header = `${EMOJIS.POINTS} ${bold('TUS PUNTOS')}`;
    const body = bulletList([
      `Puntos actuales: ${points} ${pointsName}`,
      `Mensajes enviados: ${messages}`,
      `Progreso al siguiente punto: ${messagesForNext}/${messagesPerPoint} (te faltan ${messagesNeeded})`
    ]);

    await reply(sock, msg, joinSections([header, body]));
  }
};
