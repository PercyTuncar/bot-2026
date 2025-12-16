import MemberRepository from '../../repositories/MemberRepository.js';
import { extractMentions } from '../../utils/parser.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
import { reply, reactLoading, reactSuccess, reactError } from '../../utils/reply.js';

// Mensajes aleatorios según nivel de compatibilidad
const lowCompatMessages = [
    "💔 Uy... esto no pinta bien para ustedes.",
    "😬 Mejor sigan buscando en otro lado...",
    "🙈 El amor tiene caminos misteriosos... pero este no es uno de ellos.",
    "💀 F en el chat por esta pareja...",
    "🚫 El universo dice: ¡NO!",
    "😅 Tal vez como amigos... y ya.",
    "🥶 Más frío que el corazón de mi ex.",
];

const mediumCompatMessages = [
    "🤔 Mmm... hay potencial, pero necesitan trabajar en ello.",
    "😏 No está mal, pero tampoco está bien...",
    "🎲 Es cuestión de suerte, podría funcionar.",
    "⚖️ 50/50... ¿Se arriesgan?",
    "🌤️ Hay nubes, pero también algo de sol.",
    "🤷 El destino aún no se decide con ustedes.",
    "💭 Con esfuerzo, todo es posible... ¿o no?",
];

const highCompatMessages = [
    "💕 ¡MATCH PERFECTO! ¡Ya pueden ir apartando el salón!",
    "😍 ¡El amor está en el aire! *suena música romántica*",
    "💘 Cupido acaba de hacer su trabajo. ¡Felicidades!",
    "🔥 ¡Esto arde! ¡Son el uno para el otro!",
    "💍 ¿Quién lleva los anillos?",
    "✨ Las estrellas se alinearon para ustedes.",
    "🥰 ¡Aww! ¡Hacen una pareja hermosa!",
    "💗 Esto es AMOR del bueno. ¡No lo dejen escapar!",
];

// Función para obtener emoji según compatibilidad
function getCompatEmoji(percentage: number): string {
    if (percentage < 30) return '💔';
    if (percentage < 50) return '😬';
    if (percentage < 70) return '🤔';
    if (percentage < 85) return '💕';
    return '💘';
}

// Función para obtener mensaje aleatorio según compatibilidad
function getRandomMessage(percentage: number): string {
    if (percentage < 40) {
        return lowCompatMessages[Math.floor(Math.random() * lowCompatMessages.length)];
    } else if (percentage < 70) {
        return mediumCompatMessages[Math.floor(Math.random() * mediumCompatMessages.length)];
    } else {
        return highCompatMessages[Math.floor(Math.random() * highCompatMessages.length)];
    }
}

// Función para generar barra de progreso visual
function getProgressBar(percentage: number): string {
    const totalBars = 20;
    const filledBars = Math.round((percentage / 100) * totalBars);
    const emptyBars = totalBars - filledBars;

    return '█'.repeat(filledBars) + '·'.repeat(emptyBars);
}

// Función para generar compatibilidad determinística basada en IDs
function calculateCompatibility(id1: string, id2: string): number {
    // Ordenar IDs para que el resultado sea consistente sin importar el orden
    const sortedIds = [id1, id2].sort();
    const combined = sortedIds.join('_');

    // Generar hash simple
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }

    // Convertir a porcentaje (1-100)
    return Math.abs(hash % 100) + 1;
}

export default {
    name: 'match',
    aliases: ['ship', 'love', 'pareja'],
    description: 'Hacer match entre usuarios del grupo',
    category: 'fun',
    permissions: 'user',
    scope: 'group',
    cooldown: 10,

    async execute({ sock, msg, args, groupId, userPhone, replyJid }) {
        try {
            await reactLoading(sock, msg);

            // Obtener miembros activos del grupo
            const activeMembers = await MemberRepository.getActiveMembers(groupId);

            if (activeMembers.length < 2) {
                await reactError(sock, msg);
                await reply(sock, msg, `${EMOJIS.ERROR} Se necesitan al menos 2 miembros en el grupo para hacer match.`);
                return;
            }

            // Extraer menciones del mensaje
            const mentions = extractMentions(msg);

            let user1Phone: string;
            let user2Phone: string;
            let user1Name: string;
            let user2Name: string;
            let user1Jid: string;
            let user2Jid: string;

            if (mentions.length === 0) {
                // MODO 1: Match aleatorio entre 2 miembros
                // Seleccionar 2 miembros aleatorios diferentes
                const shuffled = [...activeMembers].sort(() => Math.random() - 0.5);
                const member1 = shuffled[0];
                const member2 = shuffled[1];

                user1Phone = member1.phone;
                user2Phone = member2.phone;
                user1Name = member1.displayName || user1Phone;
                user2Name = member2.displayName || user2Phone;
                user1Jid = user1Phone.length >= 14 ? `${user1Phone}@lid` : `${user1Phone}@s.whatsapp.net`;
                user2Jid = user2Phone.length >= 14 ? `${user2Phone}@lid` : `${user2Phone}@s.whatsapp.net`;

            } else if (mentions.length === 1) {
                // MODO 2: Compatibilidad entre quien ejecuta y el mencionado
                user1Phone = userPhone;
                const senderMember = activeMembers.find(m => m.phone === userPhone);
                user1Name = msg.pushName || senderMember?.displayName || userPhone;
                user1Jid = userPhone.length >= 14 ? `${userPhone}@lid` : `${userPhone}@s.whatsapp.net`;

                const mention = mentions[0];
                user2Phone = mention.phone;
                const mentionedMember = activeMembers.find(m => m.phone === user2Phone);
                user2Name = mentionedMember?.displayName || user2Phone;
                user2Jid = mention.jid;

            } else {
                // MODO 3: Compatibilidad entre 2 usuarios mencionados
                const mention1 = mentions[0];
                const mention2 = mentions[1];

                user1Phone = mention1.phone;
                user2Phone = mention2.phone;

                const member1 = activeMembers.find(m => m.phone === user1Phone);
                const member2 = activeMembers.find(m => m.phone === user2Phone);

                user1Name = member1?.displayName || user1Phone;
                user2Name = member2?.displayName || user2Phone;
                user1Jid = mention1.jid;
                user2Jid = mention2.jid;
            }

            // Evitar match con uno mismo
            if (user1Phone === user2Phone) {
                await reactError(sock, msg);
                await reply(sock, msg, `${EMOJIS.ERROR} No puedes hacer match contigo mismo... 🙃`);
                return;
            }

            // Calcular compatibilidad
            const compatibility = calculateCompatibility(user1Phone, user2Phone);
            const emoji = getCompatEmoji(compatibility);
            const progressBar = getProgressBar(compatibility);
            const randomMessage = getRandomMessage(compatibility);

            // Determinar nivel de riesgo/éxito
            let riskLevel: string;
            let riskEmoji: string;

            if (compatibility < 30) {
                riskLevel = 'Incompatibles';
                riskEmoji = '💔';
            } else if (compatibility < 50) {
                riskLevel = 'Riesgo Alto';
                riskEmoji = '😐';
            } else if (compatibility < 70) {
                riskLevel = 'Riesgo Medio';
                riskEmoji = '🤔';
            } else if (compatibility < 85) {
                riskLevel = 'Compatibles';
                riskEmoji = '😍';
            } else {
                riskLevel = 'Almas Gemelas';
                riskEmoji = '💘';
            }

            // Construir mensaje formateado
            let message = `\n\n`;
            message += `*${emoji} LOVE MATCH RaveHub ${emoji}*\n\n`;

            message += `👥 *Pareja Analizada:*\n`;
            message += ` - • @${user1Phone}\n`;
            message += ` - • @${user2Phone}\n\n`;

            message += `📊 *Nivel de Compatibilidad:*\n`;
            message += `${progressBar} ${compatibility}%\n`;
            message += `*(${compatibility}%) - ${riskLevel}* ${riskEmoji}\n\n`;

            message += `> 💡 _Consejo: ${randomMessage}_\n`;

            await sock.sendMessage(replyJid, {
                text: message,
                mentions: [user1Jid, user2Jid]
            });

            await reactSuccess(sock, msg);
            logger.info(`[MATCH] ${user1Phone} + ${user2Phone} = ${compatibility}%`);

        } catch (error: any) {
            await reactError(sock, msg);
            await reply(sock, msg, `${EMOJIS.ERROR} Error al hacer match: ${error.message}`);
            logger.error('[MATCH] Error:', error);
        }
    }
};
