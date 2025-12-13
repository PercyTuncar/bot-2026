import MemberRepository from '../../repositories/MemberRepository.js';
import { formatNumber } from '../../utils/formatter.js';
import { bold, bulletList, joinSections, section } from '../../utils/message-builder.js';
import { reply } from '../../utils/reply.js';
export default {
    name: 'ranking',
    description: 'Tu posiciÃ³n en el ranking',
    category: 'stats',
    permissions: 'user',
    scope: 'group',
    cooldown: 10,
    async execute({ sock, msg, groupId, userPhone, replyJid }) {
        try {
            const found = await MemberRepository.findByPhoneOrLid(groupId, userPhone, userPhone);
            const member = found ? found.data : null;
            if (!member || !member.isMember) {
                await reply(sock, msg, joinSections([`${bold('❌ No estás registrado en este grupo')}`]));
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
            if (previous) {
                const diff = (previous.points || 0) - (member.points || 0);
                const prevSection = section('Diferencia con el anterior', [
                    `${previous.displayName} (#${position - 1}) - ${formatNumber(previous.points || 0)} puntos`,
                    `↑ Te faltan ${formatNumber(diff)} puntos`
                ]);
                const response = joinSections([header, main, prevSection]);
                await reply(sock, msg, response);
                return;
            }
            if (next) {
                const diff = (member.points || 0) - (next.points || 0);
                const nextSection = section('Diferencia con el siguiente', [
                    `${next.displayName} (#${position + 1}) - ${formatNumber(next.points || 0)} puntos`,
                    `↓ Le ganas por ${formatNumber(diff)} puntos`
                ]);
                const response = joinSections([header, main, nextSection]);
                await reply(sock, msg, response);
                return;
            }
            await reply(sock, msg, joinSections([header, main]));
        }
        catch (error) {
            console.error('[RANKING] Error:', error);
            await reply(sock, msg, joinSections([`${bold('❌ Error al obtener tu ranking')}`]));
        }
    }
};
