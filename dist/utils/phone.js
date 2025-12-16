export function normalizePhone(phone) {
    if (!phone)
        return '';
    let normalized = extractIdFromWid(phone);
    if (!normalized)
        return '';
    if (normalized.includes('@lid') || normalized.includes('lid')) {
        return '';
    }
    normalized = normalized.replace('@s.whatsapp.net', '')
        .replace('@c.us', '')
        .trim();
    if (normalized.includes(':')) {
        normalized = normalized.split(':')[0];
    }
    normalized = normalized.replace(/[^\d+]/g, '');
    if (normalized.startsWith('+')) {
        normalized = normalized.substring(1);
    }
    if (normalized.length < 8) {
        return '';
    }
    return normalized;
}
export async function getCanonicalId(client, rawId) {
    if (!rawId)
        return '';
    if (rawId.endsWith('@c.us')) {
        rawId = rawId.replace('@c.us', '@s.whatsapp.net');
    }
    if (rawId.endsWith('@s.whatsapp.net'))
        return rawId;
    if (!rawId.includes('@lid')) {
        const normalized = normalizePhone(rawId);
        return normalized ? `${normalized}@s.whatsapp.net` : rawId;
    }
    try {
        if (!client || !client.onWhatsApp)
            return rawId;
        const numericPart = rawId.split('@')[0].replace(/[^\d]/g, '');
        if (numericPart.length >= 8) {
            const result = await client.onWhatsApp(numericPart);
            if (result && result[0] && result[0].exists) {
                return result[0].jid;
            }
        }
        return rawId;
    }
    catch (error) {
        return rawId;
    }
}
export function extractIdFromWid(wid) {
    if (!wid)
        return '';
    if (typeof wid === 'string') {
        return wid;
    }
    if (typeof wid === 'object') {
        if (wid._serialized && typeof wid._serialized === 'string') {
            return wid._serialized;
        }
        if (wid.user && wid.server) {
            return `${wid.user}@${wid.server}`;
        }
        if (wid.id) {
            if (typeof wid.id === 'string') {
                return wid.id;
            }
            if (wid.id._serialized && typeof wid.id._serialized === 'string') {
                return wid.id._serialized;
            }
            if (wid.id.user && wid.id.server) {
                return `${wid.id.user}@${wid.id.server}`;
            }
        }
    }
    const stringified = String(wid).trim();
    if (stringified === '[object Object]') {
        return '';
    }
    return stringified;
}
export function normalizeGroupId(groupId) {
    if (!groupId)
        return '';
    const idString = extractIdFromWid(groupId);
    if (!idString)
        return '';
    let normalized = idString.replace(/@g\.us|@lid|@broadcast|@newsletter/g, '').trim();
    return normalized;
}
export function phoneToJid(phone) {
    if (!phone)
        return '';
    if (phone.includes('@lid'))
        return phone;
    const normalized = normalizePhone(phone);
    if (!normalized && phone)
        return `${phone}@s.whatsapp.net`;
    return `${normalized}@s.whatsapp.net`;
}
export function groupIdToJid(groupId) {
    const normalized = normalizeGroupId(groupId);
    return `${normalized}@g.us`;
}
export function formatPhone(phone) {
    const normalized = normalizePhone(phone);
    if (normalized.length >= 10) {
        if (normalized.startsWith('54')) {
            const country = normalized.substring(0, 2);
            const area = normalized.substring(2, 4);
            const part1 = normalized.substring(4, 8);
            const part2 = normalized.substring(8);
            return `+${country} ${area} ${part1}-${part2}`;
        }
    }
    return `+${normalized}`;
}
export function getUserId(msg, isGroup = false) {
    if (!msg)
        return '';
    const extractId = (value) => {
        if (!value)
            return '';
        if (typeof value === 'string')
            return value;
        return extractIdFromWid(value);
    };
    const msgAny = msg;
    console.log(`[getUserId] DEBUG - isGroup=${isGroup}`);
    console.log(`[getUserId] msg.author=${typeof msg.author === 'string' ? msg.author : JSON.stringify(msg.author)}`);
    console.log(`[getUserId] msg.from=${typeof msg.from === 'string' ? msg.from : JSON.stringify(msg.from)}`);
    console.log(`[getUserId] msg._data?.participant=${msgAny._data?.participant}`);
    console.log(`[getUserId] msg._data?.id?.participant=${JSON.stringify(msgAny._data?.id?.participant)}`);
    if (isGroup) {
        if (msg.author) {
            const authorId = extractId(msg.author);
            console.log(`[getUserId] P1: authorId extracted = ${authorId}`);
            if (authorId) {
                if (authorId.includes('@lid')) {
                    console.log(`[getUserId] P1: Returning LID: ${authorId}`);
                    return authorId;
                }
                const normalized = normalizePhone(authorId);
                if (normalized) {
                    console.log(`[getUserId] P1: Returning normalized: ${normalized}`);
                    return normalized;
                }
            }
        }
        if (msg._data?.participant) {
            const participantId = extractId(msg._data.participant);
            console.log(`[getUserId] P2: participantId extracted = ${participantId}`);
            if (participantId) {
                if (participantId.includes('@lid')) {
                    console.log(`[getUserId] P2: Returning LID: ${participantId}`);
                    return participantId;
                }
                const normalized = normalizePhone(participantId);
                if (normalized) {
                    console.log(`[getUserId] P2: Returning normalized: ${normalized}`);
                    return normalized;
                }
            }
        }
        const msgDataAny = msg._data;
        if (msgDataAny?.id?.participant) {
            const participantId = extractId(msgDataAny.id.participant);
            console.log(`[getUserId] P3: participantId from id = ${participantId}`);
            if (participantId) {
                if (participantId.includes('@lid')) {
                    console.log(`[getUserId] P3: Returning LID: ${participantId}`);
                    return participantId;
                }
                const normalized = normalizePhone(participantId);
                if (normalized) {
                    console.log(`[getUserId] P3: Returning normalized: ${normalized}`);
                    return normalized;
                }
            }
        }
        if (msg.from) {
            const fromId = extractId(msg.from);
            console.log(`[getUserId] P4: fromId = ${fromId}`);
            if (fromId && !fromId.endsWith('@g.us')) {
                if (fromId.includes('@lid')) {
                    console.log(`[getUserId] P4: Returning LID: ${fromId}`);
                    return fromId;
                }
                const normalized = normalizePhone(fromId);
                if (normalized) {
                    console.log(`[getUserId] P4: Returning normalized: ${normalized}`);
                    return normalized;
                }
            }
            else {
                console.log(`[getUserId] P4: Skipped - fromId is group: ${fromId}`);
            }
        }
    }
    else {
        if (msg.from) {
            const fromId = extractId(msg.from);
            if (fromId) {
                if (fromId.includes('@lid')) {
                    return fromId;
                }
                const normalized = normalizePhone(fromId);
                if (normalized)
                    return normalized;
            }
        }
        if (msg.author) {
            const authorId = extractId(msg.author);
            if (authorId) {
                if (authorId.includes('@lid')) {
                    return authorId;
                }
                const normalized = normalizePhone(authorId);
                if (normalized)
                    return normalized;
            }
        }
    }
    return '';
}
export function getUserPhoneFromMessage(msg, isGroup = false) {
    if (!msg)
        return '';
    let phone = '';
    if (isGroup) {
        if (msg.author) {
            phone = normalizePhone(msg.author);
            if (phone)
                return phone;
        }
        if (msg._data && msg._data.participant) {
            phone = normalizePhone(msg._data.participant);
            if (phone)
                return phone;
        }
    }
    else {
        if (msg.from) {
            phone = normalizePhone(msg.from);
            if (phone)
                return phone;
        }
        if (msg.to && msg.to.endsWith('@c.us')) {
            phone = normalizePhone(msg.to);
            if (phone)
                return phone;
        }
        if (msg.author) {
            phone = normalizePhone(msg.author);
            if (phone)
                return phone;
        }
        if (msg._data && msg._data.from) {
            phone = normalizePhone(msg._data.from);
            if (phone)
                return phone;
        }
    }
    return '';
}
export function getDisplayNameFromMessage(msg, fallbackPhone = '') {
    if (!msg)
        return fallbackPhone;
    if (msg._data && msg._data.pushName && msg._data.pushName.trim().length > 0) {
        return msg._data.pushName.trim();
    }
    if (msg.notifyName && msg.notifyName.trim().length > 0) {
        return msg.notifyName.trim();
    }
    if (msg.verifiedName && msg.verifiedName.trim().length > 0) {
        return msg.verifiedName.trim();
    }
    return fallbackPhone || 'Usuario';
}
export default {
    normalizePhone,
    normalizeGroupId,
    phoneToJid,
    groupIdToJid,
    formatPhone,
    getUserPhoneFromMessage,
    getUserId,
    getDisplayNameFromMessage,
    extractIdFromWid,
    getCanonicalId
};
