import { matchImageService } from '../../services/MatchImageService.js';
import MemberRepository from '../../repositories/MemberRepository.js';
import pkg from 'whatsapp-web.js';
const { MessageMedia } = pkg;
import { formatError } from '../../utils/formatter.js';
import { normalizePhone } from '../../utils/phone.js';
import logger from '../../lib/logger.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const matchMessages = require('../../data/match-messages.json');

/**
 * Comando .match - Genera imágenes de match/pareja romántico
 * 
 * Uso:
 * - .match → Selecciona 2 miembros aleatorios del grupo
 * - .match @user1 @user2 → Calcula compatibilidad entre dos usuarios mencionados
 */
export default {
    name: 'match',
    aliases: ['pareja', 'love', 'ship'],
    description: 'Encuentra la pareja perfecta del día o calcula compatibilidad',
    usage: '.match o .match @usuario1 @usuario2',
    example: '.match',
    category: 'general',
    permissions: 'member',
    scope: 'group',
    cooldown: 10,

    async execute({ sock, msg, args, groupId, groupJid, replyJid }) {
        try {
            // Obtener el chat del grupo
            let chat = null;
            try {
                chat = await msg.getChat();
            } catch (e) {
                logger.warn(`[MATCH] Could not get chat: ${e.message}`);
            }

            // Enviar mensaje inicial de búsqueda
            const searchEmoji = getRandomItem(matchMessages.emojis);
            await sock.sendMessage(replyJid, `${searchEmoji} *Estamos buscando la pareja perfecta del día...* 💖\n\n_Analizando compatibilidades..._`);

            let user1: { id: string; name: string; jid: string } | null = null;
            let user2: { id: string; name: string; jid: string } | null = null;
            let compatibility: number | undefined = undefined;
            let isRandomMatch = true;

            // Verificar si hay menciones (modo compatibilidad)
            const mentions = await msg.getMentions();

            if (mentions && mentions.length >= 2) {
                // Modo: .match @user1 @user2 → Calcular compatibilidad
                isRandomMatch = false;
                compatibility = Math.floor(Math.random() * 101); // 0-100

                const contact1 = mentions[0];
                const contact2 = mentions[1];

                user1 = {
                    id: contact1.id._serialized || contact1.number,
                    name: contact1.pushname || contact1.name || contact1.number || 'Usuario 1',
                    jid: contact1.id._serialized
                };

                user2 = {
                    id: contact2.id._serialized || contact2.number,
                    name: contact2.pushname || contact2.name || contact2.number || 'Usuario 2',
                    jid: contact2.id._serialized
                };

                logger.info(`[MATCH] Compatibility mode: ${user1.name} vs ${user2.name} = ${compatibility}%`);

            } else {
                // Modo: .match → Selección aleatoria de 2 miembros
                isRandomMatch = true;

                // Obtener participantes del grupo
                let participants: any[] = [];

                if (chat && chat.participants) {
                    participants = chat.participants;
                } else {
                    // Fallback: obtener de la base de datos
                    try {
                        const members = await MemberRepository.getActiveMembers(groupId);
                        participants = members.map(m => ({
                            id: { _serialized: `${m.phone}@c.us` },
                            number: m.phone,
                            pushname: m.displayName
                        }));
                    } catch (e) {
                        logger.warn(`[MATCH] Could not get members from DB: ${e.message}`);
                    }
                }

                // Filtrar bots y usuarios sin ID válido
                const validParticipants = participants.filter(p => {
                    const id = p.id?._serialized || p.id;
                    return id && !id.includes('bot') && typeof id === 'string';
                });

                if (validParticipants.length < 2) {
                    await sock.sendMessage(replyJid, formatError('Se necesitan al menos 2 miembros en el grupo para hacer match'));
                    return;
                }

                // Seleccionar 2 participantes aleatorios diferentes
                const shuffled = [...validParticipants].sort(() => Math.random() - 0.5);
                const selected1 = shuffled[0];
                const selected2 = shuffled[1];

                // Obtener información de los contactos
                const getContactInfo = async (participant: any): Promise<{ id: string; name: string; jid: string }> => {
                    const jid = participant.id?._serialized || `${participant.number}@c.us`;
                    let name = participant.pushname || participant.name || participant.number;

                    // Intentar obtener más información del contacto
                    try {
                        const contact = await sock.getContactById(jid);
                        if (contact) {
                            name = contact.pushname || contact.name || contact.shortName || name;
                        }
                    } catch (e) {
                        // Ignorar errores
                    }

                    // Limpiar nombre si es undefined o inválido
                    if (!name || name === 'undefined' || name === 'null') {
                        const phone = jid.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@lid', '');
                        name = phone;
                    }

                    return { id: jid, name, jid };
                };

                user1 = await getContactInfo(selected1);
                user2 = await getContactInfo(selected2);

                logger.info(`[MATCH] Random match: ${user1.name} ❤️ ${user2.name}`);
            }

            if (!user1 || !user2) {
                await sock.sendMessage(replyJid, formatError('No se pudieron obtener los datos de los usuarios'));
                return;
            }

            // Generar la imagen de match
            const imageBuffer = await matchImageService.createMatchImage(user1, user2, sock, compatibility);

            if (!imageBuffer) {
                await sock.sendMessage(replyJid, formatError('Error al generar la imagen de match'));
                return;
            }

            // Construir el mensaje romántico
            let message = '';

            if (isRandomMatch) {
                // Mensaje para match aleatorio
                const title = getRandomItem(matchMessages.titles);
                const phrase = getRandomItem(matchMessages.randomPhrases);
                const wish = getRandomItem(matchMessages.wishes);
                const emoji1 = getRandomItem(matchMessages.emojis);
                const emoji2 = getRandomItem(matchMessages.emojis);

                message = `\n\n${emoji1} *${title}* ${emoji2}\n\n`;
                message += `💕 @${normalizePhone(user1.id) || user1.id.split('@')[0]} & @${normalizePhone(user2.id) || user2.id.split('@')[0]}\n\n`;
                message += `✨ _${phrase}_\n\n`;
                message += `${wish}\n\n`;
                message += `💖💕💗💓💞`;

            } else {
                // Mensaje con compatibilidad
                let level: 'low' | 'medium' | 'high';
                if (compatibility! <= 40) level = 'low';
                else if (compatibility! <= 70) level = 'medium';
                else level = 'high';

                const compatData = matchMessages.compatibility[level];
                const phrase = getRandomItem(compatData.phrases);

                message = `\n\n${compatData.emoji} *RESULTADO DE COMPATIBILIDAD* ${compatData.emoji}\n\n`;
                message += `👤 @${normalizePhone(user1.id) || user1.id.split('@')[0]}\n`;
                message += `💕\n`;
                message += `👤 @${normalizePhone(user2.id) || user2.id.split('@')[0]}\n\n`;
                message += `━━━━━━━━━━━━━━━━━━━━\n`;
                message += `📊 *Compatibilidad:* ${compatibility}%\n`;
                message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                message += `${phrase}`;
            }

            // Crear media y enviar
            const media = new MessageMedia('image/png', imageBuffer.toString('base64'), 'match.png');

            await sock.sendMessage(replyJid, media, {
                caption: message,
                mentions: [user1.jid, user2.jid]
            });

            logger.info(`[MATCH] Match sent successfully for ${user1.name} & ${user2.name}`);

        } catch (error: any) {
            logger.error('[MATCH] Error in match command:', error);
            await sock.sendMessage(replyJid, formatError('Error al ejecutar el comando match: ' + (error.message || 'Error desconocido')));
        }
    }
};

/**
 * Obtiene un elemento aleatorio de un array
 */
function getRandomItem<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}
