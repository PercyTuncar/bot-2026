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
            let chat = null;
            try {
                chat = await msg.getChat();
            }
            catch (e) {
                logger.warn(`[MATCH] Could not get chat: ${e.message}`);
            }
            const searchEmoji = getRandomItem(matchMessages.emojis);
            await sock.sendMessage(replyJid, `${searchEmoji} *Estamos buscando la pareja perfecta del día...* 💖\n\n_Analizando compatibilidades..._`);
            let user1 = null;
            let user2 = null;
            let compatibility = undefined;
            let isRandomMatch = true;
            let mentions = [];
            try {
                mentions = await msg.getMentions() || [];
                logger.info(`[MATCH] getMentions returned ${mentions.length} mentions`);
            }
            catch (e) {
                logger.warn(`[MATCH] getMentions failed: ${e.message}`);
            }
            if (mentions.length < 2 && msg.mentionedIds && msg.mentionedIds.length >= 2) {
                logger.info(`[MATCH] Using mentionedIds fallback: ${msg.mentionedIds.length} mentions`);
                for (const mentionId of msg.mentionedIds.slice(0, 2)) {
                    try {
                        const contact = await sock.getContactById(mentionId);
                        if (contact) {
                            mentions.push(contact);
                        }
                    }
                    catch (e) {
                        mentions.push({
                            id: { _serialized: mentionId },
                            number: mentionId.replace('@c.us', '').replace('@lid', ''),
                            pushname: null,
                            name: null
                        });
                    }
                }
            }
            if (mentions && mentions.length >= 2) {
                isRandomMatch = false;
                compatibility = Math.floor(Math.random() * 101);
                const contact1 = mentions[0];
                const contact2 = mentions[1];
                user1 = {
                    id: contact1.id?._serialized || contact1.id || contact1.number,
                    name: contact1.pushname || contact1.name || contact1.number || 'Usuario 1',
                    jid: contact1.id?._serialized || contact1.id || `${contact1.number}@c.us`
                };
                user2 = {
                    id: contact2.id?._serialized || contact2.id || contact2.number,
                    name: contact2.pushname || contact2.name || contact2.number || 'Usuario 2',
                    jid: contact2.id?._serialized || contact2.id || `${contact2.number}@c.us`
                };
                logger.info(`[MATCH] Compatibility mode: ${user1.name} vs ${user2.name} = ${compatibility}%`);
            }
            else {
                isRandomMatch = true;
                let participants = [];
                if (chat && chat.participants) {
                    participants = chat.participants;
                }
                else {
                    try {
                        const members = await MemberRepository.getActiveMembers(groupId);
                        participants = members.map(m => ({
                            id: { _serialized: `${m.phone}@c.us` },
                            number: m.phone,
                            pushname: m.displayName
                        }));
                    }
                    catch (e) {
                        logger.warn(`[MATCH] Could not get members from DB: ${e.message}`);
                    }
                }
                const validParticipants = participants.filter(p => {
                    const id = p.id?._serialized || p.id;
                    return id && !id.includes('bot') && typeof id === 'string';
                });
                if (validParticipants.length < 2) {
                    await sock.sendMessage(replyJid, formatError('Se necesitan al menos 2 miembros en el grupo para hacer match'));
                    return;
                }
                const shuffled = [...validParticipants].sort(() => Math.random() - 0.5);
                const selected1 = shuffled[0];
                const selected2 = shuffled[1];
                const getContactInfo = async (participant) => {
                    const jid = participant.id?._serialized || `${participant.number}@c.us`;
                    let name = participant.pushname || participant.name || participant.number;
                    try {
                        const contact = await sock.getContactById(jid);
                        if (contact) {
                            name = contact.pushname || contact.name || contact.shortName || name;
                        }
                    }
                    catch (e) {
                    }
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
            const imageBuffer = await matchImageService.createMatchImage(user1, user2, sock, compatibility);
            if (!imageBuffer) {
                await sock.sendMessage(replyJid, formatError('Error al generar la imagen de match'));
                return;
            }
            let message = '';
            if (isRandomMatch) {
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
            }
            else {
                let level;
                if (compatibility <= 40)
                    level = 'low';
                else if (compatibility <= 70)
                    level = 'medium';
                else
                    level = 'high';
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
            const media = new MessageMedia('image/png', imageBuffer.toString('base64'), 'match.png');
            await sock.sendMessage(replyJid, media, {
                caption: message,
                mentions: [user1.jid, user2.jid]
            });
            logger.info(`[MATCH] Match sent successfully for ${user1.name} & ${user2.name}`);
        }
        catch (error) {
            logger.error('[MATCH] Error in match command:', error);
            await sock.sendMessage(replyJid, formatError('Error al ejecutar el comando match: ' + (error.message || 'Error desconocido')));
        }
    }
};
function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
