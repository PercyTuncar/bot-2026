import MemberRepository from '../../repositories/MemberRepository.js';
import GroupRepository from '../../repositories/GroupRepository.js';
import { EMOJIS } from '../../config/constants.js';
import { config } from '../../config/environment.js';
import { bold, bulletList, joinSections } from '../../utils/message-builder.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';
export default {
    name: 'mypoints',
    description: 'Ver tus puntos actuales',
    category: 'general',
    permissions: 'user',
    scope: 'group',
    cooldown: 5,
    async execute({ sock, msg, groupId, userPhone, replyJid, member: contextMember }) {
        try {
            await reactLoading(sock, msg);
            let member = contextMember;
            if (!member) {
                const found = await MemberRepository.findByPhoneOrLid(groupId, userPhone, userPhone);
                member = found ? found.data : null;
            }
            if (!member) {
                await reactError(sock, msg);
                await reply(sock, msg, `${EMOJIS.ERROR} ${bold('No estás registrado en este grupo')}`);
                return;
            }
            const points = member.points || 0;
            const messages = member.messageCount || 0;
            const groupConfig = await GroupRepository.getConfig(groupId);
            const group = await GroupRepository.getById(groupId);
            const messagesPerPoint = groupConfig?.messagesPerPoint
                || groupConfig?.points?.perMessages
                || group?.config?.messagesPerPoint
                || group?.config?.points?.perMessages
                || config.points.perMessages;
            const pointsName = groupConfig?.pointsName || group?.config?.points?.name || config.points.name;
            const progress = messages % messagesPerPoint;
            const messagesNeeded = messagesPerPoint - progress;
            const header = `${EMOJIS.POINTS} ${bold('TUS PUNTOS')}`;
            const body = bulletList([
                `Puntos actuales: ${points} ${pointsName}`,
                `Mensajes enviados: ${messages}`,
                `Progreso: ${progress}/${messagesPerPoint}`
            ]);
            await reply(sock, msg, joinSections([header, body]));
            await reactSuccess(sock, msg);
        }
        catch (error) {
            await reactError(sock, msg);
            await reply(sock, msg, `${EMOJIS.ERROR} Error: ${error.message}`);
        }
    }
};
