import { config } from '../config/environment.js';
import logger from '../lib/logger.js';
export function parseCommand(text) {
    if (!text || typeof text !== 'string') {
        return null;
    }
    const trimmed = text.trim();
    if (!trimmed.startsWith(config.bot.prefix)) {
        return null;
    }
    const withoutPrefix = trimmed.substring(config.bot.prefix.length).trim();
    const parts = withoutPrefix.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    const commandEndIndex = withoutPrefix.indexOf(command) + command.length;
    const rawArgs = withoutPrefix.substring(commandEndIndex).trim();
    return {
        command,
        args,
        raw: withoutPrefix,
        rawArgs
    };
}
export function extractMentions(msg) {
    const mentions = [];
    const seen = new Set();
    if (msg.mentionedJidList && msg.mentionedJidList.length > 0) {
        for (const jid of msg.mentionedJidList) {
            if (jid.endsWith('@lid')) {
                continue;
            }
            const phone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
            if (phone.length >= 8 && phone.length <= 14 && /^\d+$/.test(phone) && !seen.has(phone)) {
                mentions.push(phone);
                seen.add(phone);
            }
        }
    }
    if (mentions.length === 0) {
        const text = msg.body || '';
        const regex = /@(\d+)/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const phone = match[1];
            if (phone.length >= 8 && phone.length <= 14 && !seen.has(phone)) {
                mentions.push(phone);
                seen.add(phone);
            }
        }
    }
    return mentions;
}
export function getFirstMention(msg) {
    const mentions = extractMentions(msg);
    return mentions.length > 0 ? mentions[0] : null;
}
export async function getMentionsAsync(msg) {
    try {
        if (typeof msg.getMentions === 'function') {
            const mentions = await msg.getMentions();
            return mentions || [];
        }
    }
    catch (error) {
    }
    return [];
}
export async function getFirstMentionAsync(msg) {
    const mentions = await getMentionsAsync(msg);
    return mentions.length > 0 ? mentions[0] : null;
}
export function extractContactInfo(contact, allowLid = false) {
    if (!contact)
        return null;
    const rawId = contact.id?._serialized || contact.id || '';
    const isLid = rawId.endsWith('@lid');
    let phone = contact.number || '';
    if (!phone && contact.id?.user && !isLid) {
        phone = contact.id.user;
    }
    if (!phone && isLid) {
        if (allowLid) {
            const lidNumber = rawId.replace('@lid', '').split(':')[0];
            phone = lidNumber;
        }
        else {
            return null;
        }
    }
    if (!phone && !isLid) {
        phone = rawId.split('@')[0] || '';
    }
    phone = phone.replace(/@.*$/, '');
    if (!phone || !/^\d+$/.test(phone)) {
        return null;
    }
    if (!isLid && (phone.length < 8 || phone.length > 14)) {
        return null;
    }
    const name = contact.pushname || contact.name || contact.shortName || phone || 'Usuario';
    const jid = isLid ? rawId : `${phone}@s.whatsapp.net`;
    return {
        id: rawId,
        phone,
        name,
        jid,
        isLid
    };
}
export async function getTargetUser(msg, chat = null) {
    let targetContact = null;
    let method = null;
    logger.info(`[getTargetUser] Starting - hasQuotedMsg=${msg.hasQuotedMsg}`);
    if (msg.hasQuotedMsg) {
        try {
            const quotedMsg = await msg.getQuotedMessage();
            logger.info(`[getTargetUser] Strategy 1: Got quoted message`);
            if (quotedMsg) {
                const quotedAuthor = quotedMsg.author || quotedMsg.from || quotedMsg._data?.author || quotedMsg._data?.from;
                const quotedParticipant = quotedMsg._data?.participant || quotedMsg._data?.id?.participant;
                const authorId = quotedAuthor || quotedParticipant;
                logger.info(`[getTargetUser] Strategy 1: quotedAuthor=${quotedAuthor}, quotedParticipant=${quotedParticipant}, authorId=${authorId}`);
                if (authorId) {
                    const isLid = authorId.includes('@lid');
                    let phone = '';
                    let jid = authorId;
                    if (isLid) {
                        const lidNumber = authorId.replace('@lid', '').split(':')[0];
                        phone = lidNumber;
                        jid = authorId;
                        logger.info(`[getTargetUser] Strategy 1: Detected LID - lidNumber=${lidNumber}`);
                        let displayName = quotedMsg._data?.notifyName || quotedMsg.pushName || lidNumber;
                        if (chat && chat.isGroup && chat.participants) {
                            const participant = chat.participants.find(p => p.id._serialized === authorId ||
                                p.id._serialized?.includes(lidNumber));
                            if (participant) {
                                if (participant.id?.user && !participant.id._serialized?.includes('@lid')) {
                                    phone = participant.id.user;
                                    jid = `${phone}@s.whatsapp.net`;
                                    logger.info(`[getTargetUser] Strategy 1: Found real number from participant: ${phone}`);
                                }
                            }
                        }
                        return {
                            contact: null,
                            phone: phone,
                            name: displayName,
                            jid: jid,
                            method: 'quoted',
                            isLid: true
                        };
                    }
                    else {
                        phone = authorId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@g.us', '');
                        jid = `${phone}@s.whatsapp.net`;
                        const displayName = quotedMsg._data?.notifyName || quotedMsg.pushName || phone;
                        if (phone && /^\d{8,15}$/.test(phone)) {
                            logger.info(`[getTargetUser] Strategy 1: Found normal number: ${phone}`);
                            return {
                                contact: null,
                                phone: phone,
                                name: displayName,
                                jid: jid,
                                method: 'quoted',
                                isLid: false
                            };
                        }
                    }
                }
                try {
                    targetContact = await quotedMsg.getContact();
                    logger.info(`[getTargetUser] Strategy 1 fallback: Contact - id=${targetContact?.id?._serialized}, number=${targetContact?.number}, pushname=${targetContact?.pushname}`);
                    method = 'quoted';
                    const info = extractContactInfo(targetContact);
                    logger.info(`[getTargetUser] Strategy 1 fallback: extractContactInfo result=${JSON.stringify(info)}`);
                    if (info && info.phone) {
                        return {
                            contact: targetContact,
                            phone: info.phone,
                            name: info.name,
                            jid: info.jid,
                            method,
                            isLid: info.isLid
                        };
                    }
                }
                catch (contactError) {
                    logger.warn(`[getTargetUser] Strategy 1 fallback getContact() failed: ${contactError.message}`);
                }
            }
        }
        catch (error) {
            logger.error(`[getTargetUser] Strategy 1 error: ${error.message}`);
        }
    }
    if (!targetContact) {
        try {
            const mentions = await getMentionsAsync(msg);
            logger.info(`[getTargetUser] Strategy 2: getMentions() returned ${mentions?.length || 0} contacts`);
            if (mentions && mentions.length > 0) {
                for (let i = 0; i < mentions.length; i++) {
                    const mention = mentions[i];
                    logger.info(`[getTargetUser] Strategy 2: Mention[${i}] - id=${mention?.id?._serialized}, number=${mention?.number}, pushname=${mention?.pushname}`);
                    const info = extractContactInfo(mention);
                    logger.info(`[getTargetUser] Strategy 2: extractContactInfo[${i}] result=${JSON.stringify(info)}`);
                    if (info && info.phone) {
                        return {
                            contact: mention,
                            phone: info.phone,
                            name: info.name,
                            jid: info.jid,
                            method: 'mention',
                            isLid: info.isLid
                        };
                    }
                }
            }
        }
        catch (error) {
            logger.error(`[getTargetUser] Strategy 2 error: ${error.message}`);
        }
    }
    const mentionedJids = msg.mentionedIds || msg._data?.mentionedJidList || [];
    logger.info(`[getTargetUser] Strategy 3: mentionedJids=${JSON.stringify(mentionedJids)}`);
    if (mentionedJids.length > 0) {
        const mentionedLid = mentionedJids[0];
        logger.info(`[getTargetUser] Strategy 3: Processing mentionedLid=${mentionedLid}`);
        try {
            const chatObj = chat || await msg.getChat();
            logger.info(`[getTargetUser] Strategy 3: Got chat, isGroup=${chatObj?.isGroup}`);
            if (chatObj && chatObj.isGroup && chatObj.participants) {
                logger.info(`[getTargetUser] Strategy 3: Searching in ${chatObj.participants.length} participants`);
                for (const participant of chatObj.participants) {
                    const participantId = participant.id?._serialized || participant.id;
                    if (participantId === mentionedLid) {
                        try {
                            const contact = await chatObj.client?.getContactById(participantId);
                            if (contact) {
                                logger.info(`[getTargetUser] Strategy 3: Found contact for LID - number=${contact.number}, pushname=${contact.pushname}`);
                                if (contact.number) {
                                    const phone = contact.number.replace(/\D/g, '');
                                    if (phone.length >= 8 && phone.length <= 14) {
                                        return {
                                            contact: contact,
                                            phone: phone,
                                            name: contact.pushname || contact.name || phone,
                                            jid: `${phone}@s.whatsapp.net`,
                                            method: 'lid_resolved',
                                            isLid: true
                                        };
                                    }
                                }
                            }
                        }
                        catch (contactErr) {
                            logger.error(`[getTargetUser] Strategy 3: Error getting contact: ${contactErr.message}`);
                        }
                    }
                }
                const lidNumber = mentionedLid.replace('@lid', '').replace('@s.whatsapp.net', '');
                logger.info(`[getTargetUser] Strategy 3: Returning LID as fallback: ${lidNumber}`);
                return {
                    contact: null,
                    phone: lidNumber,
                    name: lidNumber,
                    jid: mentionedLid,
                    method: 'lid_direct',
                    isLid: true
                };
            }
        }
        catch (chatErr) {
            logger.error(`[getTargetUser] Strategy 3: Error getting chat: ${chatErr.message}`);
            const lidNumber = mentionedLid.replace('@lid', '').replace('@s.whatsapp.net', '');
            logger.info(`[getTargetUser] Strategy 3 fallback: Returning LID directly: ${lidNumber}`);
            return {
                contact: null,
                phone: lidNumber,
                name: lidNumber,
                jid: mentionedLid,
                method: 'lid_fallback',
                isLid: true
            };
        }
    }
    logger.info(`[getTargetUser] Strategy 4: Trying text extraction`);
    const textMentions = extractMentions(msg);
    logger.info(`[getTargetUser] Strategy 4: extractMentions returned ${JSON.stringify(textMentions)}`);
    if (textMentions.length > 0) {
        const phone = textMentions[0];
        if (phone && phone.length >= 8 && phone.length <= 14 && /^\d+$/.test(phone)) {
            return {
                contact: null,
                phone: phone,
                name: phone,
                jid: `${phone}@s.whatsapp.net`,
                method: 'text',
                isLid: false
            };
        }
    }
    return null;
}
export default {
    parseCommand,
    extractMentions,
    getFirstMention,
    getMentionsAsync,
    getFirstMentionAsync,
    extractContactInfo,
    getTargetUser
};
