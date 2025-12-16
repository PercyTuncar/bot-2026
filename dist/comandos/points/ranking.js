import MemberRepository from '../../repositories/MemberRepository.js';
import { EMOJIS } from '../../config/constants.js';
import { formatNumber } from '../../utils/formatter.js';
import { bold, bulletList, joinSections } from '../../utils/message-builder.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';
export default {
    name: 'ranking',
    description: 'Tu posición en el ranking',
    category: 'stats',
    permissions: 'user',
    scope: 'group',
    cooldown: 10,
    async execute({ sock, msg, groupId, userPhone, replyJid }) {
        try {
            await reactLoading(sock, msg);
            const found = await MemberRepository.findByPhoneOrLid(groupId, userPhone, userPhone);
            const member = found ? found.data : null;
            if (!member || !member.isMember) {
                await reactError(sock, msg);
                await reply(sock, msg, `${EMOJIS.ERROR} No estás registrado en este grupo`);
                return;
            }
            const [position, allMembers] = await Promise.all([
                MemberRepository.getRankPosition(groupId, userPhone),
                MemberRepository.getActiveMembers(groupId)
            ]);
            const sorted = allMembers.sort((a, b) => (b.points || 0) - (a.points || 0));
            const currentIndex = sorted.findIndex(m => {
                if (userPhone.includes('@lid')) {
                    return m.lid === userPhone || m.phone === userPhone.split('@')[0];
                }
                return m.phone === userPhone || m.lid === userPhone;
            });
            const previous = currentIndex > 0 ? sorted[currentIndex - 1] : null;
            const next = currentIndex < sorted.length - 1 ? sorted[currentIndex + 1] : null;
            const header = `📊 ${bold('TU POSICIÓN')}`;
            const main = bulletList([
                `Puesto: #${position} de ${allMembers.length} participantes`,
                `Puntos: ${formatNumber(member.points || 0)}`,
                `Mensajes: ${formatNumber(member.messageCount || 0)}`
            ]);
            let response = joinSections([header, main]);
            if (previous) {
                const diff = (previous.points || 0) - (member.points || 0);
                response += `\n\n${bold('Diferencia con el anterior:')}\n`;
                response += `${previous.displayName} (#${position - 1}) - ${formatNumber(previous.points || 0)} puntos\n`;
                response += `↑ Te faltan ${formatNumber(diff)} puntos`;
            }
            if (next) {
                const diff = (member.points || 0) - (next.points || 0);
                response += `\n\n${bold('Diferencia con el siguiente:')}\n`;
                response += `${next.displayName} (#${position + 1}) - ${formatNumber(next.points || 0)} puntos\n`;
                response += `↓ Le ganas por ${formatNumber(diff)} puntos`;
            }
            await reply(sock, msg, response);
            await reactSuccess(sock, msg);
        }
        catch (error) {
            await reactError(sock, msg);
            await reply(sock, msg, `${EMOJIS.ERROR} Error al obtener tu ranking`);
        }
    }
};
