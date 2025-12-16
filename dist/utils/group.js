import logger from '../lib/logger.js';
import { normalizePhone } from './phone.js';
function normalizeParticipantId(participant) {
    if (!participant)
        return null;
    if (typeof participant === 'string') {
        return participant;
    }
    if (participant._serialized) {
        return String(participant._serialized);
    }
    if (participant.id) {
        if (typeof participant.id === 'string') {
            return participant.id;
        }
        if (participant.id._serialized) {
            return participant.id._serialized;
        }
        if (participant.id.user && participant.id.server) {
            return `${participant.id.user}@${participant.id.server}`;
        }
    }
    if (participant.wid?._serialized) {
        return participant.wid._serialized;
    }
    if (participant.user && participant.server) {
        return `${participant.user}@${participant.server}`;
    }
    return null;
}
function toArray(source) {
    if (!source) {
        return null;
    }
    if (Array.isArray(source)) {
        return source;
    }
    if (typeof source.serialize === 'function') {
        const serialized = source.serialize();
        if (Array.isArray(serialized)) {
            return serialized;
        }
    }
    if (Array.isArray(source._models)) {
        return source._models;
    }
    if (typeof source.values === 'function') {
        return Array.from(source.values());
    }
    if (typeof source.toArray === 'function') {
        const arr = source.toArray();
        if (Array.isArray(arr)) {
            return arr;
        }
    }
    try {
        return Array.from(source);
    }
    catch (error) {
        return null;
    }
}
export function extractParticipants(chat) {
    const sources = [
        chat?.participants,
        chat?.groupMetadata?.participants,
        chat?.groupMetadata?.participants?._models
    ];
    for (const source of sources) {
        const arr = toArray(source);
        if (arr && arr.length) {
            return arr;
        }
    }
    return [];
}
export function formatParticipant(participant) {
    const id = normalizeParticipantId(participant);
    if (!id) {
        return null;
    }
    return {
        id,
        normalizedId: normalizePhone(id),
        admin: participant?.isSuperAdmin
            ? 'superadmin'
            : participant?.isAdmin
                ? 'admin'
                : participant?.admin || null,
        isAdmin: !!(participant?.isAdmin || participant?.isSuperAdmin || participant?.admin),
        name: participant?.name || participant?.pushname || participant?.notify || participant?.shortName || null
    };
}
function sanitizeChatId(idValue, fallback) {
    if (!idValue) {
        return (fallback || '').trim();
    }
    if (typeof idValue === 'string') {
        return idValue.trim();
    }
    if (typeof idValue === 'object' && idValue !== null) {
        if ('_serialized' in idValue && idValue._serialized && typeof idValue._serialized === 'string') {
            return idValue._serialized.trim();
        }
        if (idValue.user && idValue.server) {
            return `${idValue.user}@${idValue.server}`;
        }
        if (idValue.id) {
            if (typeof idValue.id === 'string') {
                return idValue.id.trim();
            }
            if (idValue.id._serialized && typeof idValue.id._serialized === 'string') {
                return idValue.id._serialized.trim();
            }
            if (idValue.id.user && idValue.id.server) {
                return `${idValue.id.user}@${idValue.id.server}`;
            }
        }
        if (idValue.wid) {
            if (typeof idValue.wid === 'string') {
                return idValue.wid.trim();
            }
            if (idValue.wid._serialized && typeof idValue.wid._serialized === 'string') {
                return idValue.wid._serialized.trim();
            }
        }
    }
    const result = String(idValue || fallback || '').trim();
    if (result === '[object Object]') {
        return (fallback || '').trim();
    }
    return result;
}
function buildGroupMetadataFromChat(chat, fallbackId) {
    if (!chat) {
        throw new Error('No se pudo cargar la informacion del grupo.');
    }
    const participants = extractParticipants(chat)
        .map(formatParticipant)
        .filter(Boolean);
    if (!participants.length) {
        throw new Error('No se pudieron obtener los participantes del grupo.');
    }
    const canonicalId = sanitizeChatId(chat.id, fallbackId);
    if (!canonicalId) {
        throw new Error('No se pudo determinar el ID del grupo.');
    }
    return {
        id: canonicalId,
        canonicalJid: canonicalId,
        rawId: fallbackId || null,
        subject: chat.name || chat.groupMetadata?.subject || 'Sin nombre',
        desc: chat.description || chat.groupMetadata?.desc || '',
        owner: normalizeParticipantId(chat.owner) || normalizeParticipantId(chat.groupMetadata?.owner) || null,
        participants
    };
}
export function buildGroupMetadata(chat, fallbackId) {
    return buildGroupMetadataFromChat(chat, fallbackId);
}
export async function fetchGroupChat(sock, groupId, msg) {
    if (!sock) {
        throw new Error('Cliente de WhatsApp no inicializado.');
    }
    const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
    let metadata = null;
    let lastError = null;
    if (typeof sock.groupMetadata === 'function') {
        try {
            metadata = await sock.groupMetadata(targetJid);
            if (metadata) {
                return {
                    id: metadata.id,
                    isGroup: true,
                    name: metadata.subject,
                    description: metadata.desc || '',
                    owner: metadata.owner,
                    participants: metadata.participants || [],
                    groupMetadata: metadata
                };
            }
        }
        catch (error) {
            lastError = error;
            logger.warn(`[group-utils] groupMetadata falló para ${groupId}: ${error.message}`);
        }
    }
    if (!metadata && typeof msg?.getChat === 'function') {
        try {
            const chat = await msg.getChat();
            if (chat) {
                return {
                    id: chat.id,
                    isGroup: true,
                    name: chat.subject || chat.name,
                    description: chat.desc || chat.description || '',
                    owner: chat.owner,
                    participants: chat.participants || [],
                    groupMetadata: chat
                };
            }
        }
        catch (error) {
            logger.warn(`[group-utils] msg.getChat() falló: ${error.message}`);
            if (!lastError) {
                lastError = error;
            }
        }
    }
    if (!metadata) {
        if (lastError) {
            throw lastError;
        }
        throw new Error('El chat no es un grupo o no se pudo encontrar.');
    }
    return metadata;
}
export async function resolveGroupMetadata(sock, groupId, msg) {
    const targetJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
    if (typeof sock.groupMetadata === 'function') {
        try {
            const metadata = await sock.groupMetadata(targetJid);
            if (metadata) {
                const formattedParticipants = (metadata.participants || []).map((p) => ({
                    id: p.id,
                    normalizedId: normalizePhone(p.id),
                    admin: p.admin || null,
                    isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
                    name: null
                }));
                return {
                    id: metadata.id.replace('@g.us', ''),
                    canonicalJid: metadata.id,
                    rawId: groupId,
                    subject: metadata.subject || 'Sin nombre',
                    desc: metadata.desc || '',
                    owner: metadata.owner || null,
                    participants: formattedParticipants
                };
            }
        }
        catch (error) {
            logger.warn(`[group-utils] resolveGroupMetadata error: ${error.message}`);
        }
    }
    const chat = await fetchGroupChat(sock, groupId, msg);
    return buildGroupMetadataFromChat(chat, chat.id || groupId);
}
export function findParticipantByPhone(chat, phone) {
    if (!chat) {
        return null;
    }
    const normalized = normalizePhone(phone);
    return extractParticipants(chat)
        .map(formatParticipant)
        .find((participant) => participant?.normalizedId === normalized);
}
export function getAdminPhonesFromChat(chat) {
    return extractParticipants(chat)
        .map(formatParticipant)
        .filter((participant) => participant?.isAdmin)
        .map((participant) => participant.normalizedId);
}
