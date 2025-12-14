import logger from '../lib/logger.js';
import { normalizePhone, normalizeGroupId } from './phone.js';
const lidCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const lidNameCache = new Map();
export async function forceLoadContactData(client, participantJid, groupJid) {
    if (!client?.pupPage)
        return { name: null, phone: null };
    try {
        logger.info(`🔍 [FORCE LOAD] Forzando carga de datos para ${participantJid}...`);
        const result = await client.pupPage.evaluate(async (pJid, gJid) => {
            try {
                const store = window.Store;
                if (!store)
                    return { success: false, name: null, phone: null, error: 'Store no disponible' };
                const isValid = (n) => {
                    if (!n || typeof n !== 'string')
                        return false;
                    const t = n.trim();
                    return t.length > 0 && t !== 'undefined' && t !== 'null' && t !== 'Unknown';
                };
                let isLargeGroup = false;
                let participantCount = 0;
                if (gJid && store.GroupMetadata) {
                    try {
                        const groupMeta = store.GroupMetadata.get(gJid);
                        if (groupMeta && groupMeta.participants) {
                            const participants = Array.isArray(groupMeta.participants)
                                ? groupMeta.participants
                                : (groupMeta.participants.getModelsArray ? groupMeta.participants.getModelsArray() : []);
                            if (Array.isArray(participants)) {
                                participantCount = participants.length;
                                isLargeGroup = participantCount > 100;
                            }
                        }
                    }
                    catch (e) {
                        isLargeGroup = true;
                    }
                }
                const waitTimes = {
                    openChat: isLargeGroup ? 1500 : 800,
                    openProfile: isLargeGroup ? 1000 : 500,
                    openGroupInfo: isLargeGroup ? 2500 : 1200,
                    queryExist: isLargeGroup ? 1200 : 500,
                    finalWait: isLargeGroup ? 1500 : 500
                };
                if (gJid && store.Cmd && store.Chat) {
                    try {
                        const groupChat = store.Chat.get(gJid);
                        if (groupChat) {
                            if (store.Cmd.openChatBottom) {
                                try {
                                    await store.Cmd.openChatBottom(groupChat);
                                    await new Promise(r => setTimeout(r, waitTimes.openChat));
                                }
                                catch (e) { }
                            }
                            if (store.Cmd.openDrawerMid) {
                                try {
                                    await store.Cmd.openDrawerMid(groupChat);
                                    await new Promise(r => setTimeout(r, waitTimes.openGroupInfo));
                                    if (store.Cmd.closeDrawerRight) {
                                        await store.Cmd.closeDrawerRight();
                                    }
                                }
                                catch (e) { }
                            }
                        }
                    }
                    catch (e) { }
                }
                if (store.Cmd && store.Chat) {
                    try {
                        let userChat = store.Chat.get(pJid);
                        if (!userChat && store.Cmd.openChatBottom) {
                            let wid = pJid;
                            if (store.Wid && !pJid.includes('@')) {
                                try {
                                    wid = store.Wid.createUserWid(pJid);
                                }
                                catch (e) { }
                            }
                            try {
                                await store.Cmd.openChatBottom(wid);
                                await new Promise(r => setTimeout(r, waitTimes.openChat));
                                userChat = store.Chat.get(pJid);
                            }
                            catch (e) { }
                        }
                        if (userChat && store.Cmd.openDrawerRight) {
                            try {
                                await store.Cmd.openDrawerRight();
                                await new Promise(r => setTimeout(r, waitTimes.openProfile));
                                if (store.Cmd.closeDrawerRight) {
                                    await store.Cmd.closeDrawerRight();
                                }
                            }
                            catch (e) { }
                        }
                    }
                    catch (cmdErr) { }
                }
                if (store.QueryExist) {
                    try {
                        await store.QueryExist(pJid);
                        await new Promise(r => setTimeout(r, waitTimes.queryExist));
                    }
                    catch (e) { }
                }
                await new Promise(r => setTimeout(r, waitTimes.finalWait));
                let foundName = null;
                let foundPhone = null;
                if (store.Contact) {
                    const contact = store.Contact.get(pJid);
                    if (contact) {
                        if (isValid(contact.pushname))
                            foundName = contact.pushname;
                        else if (isValid(contact.verifiedName))
                            foundName = contact.verifiedName;
                        else if (isValid(contact.notifyName))
                            foundName = contact.notifyName;
                        foundPhone = contact.number || contact.phoneNumber || null;
                    }
                }
                if (!foundName && gJid && store.GroupMetadata) {
                    const groupMeta = store.GroupMetadata.get(gJid);
                    if (groupMeta && groupMeta.participants) {
                        const participants = Array.isArray(groupMeta.participants)
                            ? groupMeta.participants
                            : (groupMeta.participants.getModelsArray ? groupMeta.participants.getModelsArray() : []);
                        if (Array.isArray(participants)) {
                            for (const p of participants) {
                                const pid = p.id?._serialized || p.id;
                                if (pid === pJid) {
                                    if (isValid(p.pushname))
                                        foundName = p.pushname;
                                    else if (isValid(p.notify))
                                        foundName = p.notify;
                                    if (!foundPhone)
                                        foundPhone = p.number || null;
                                    break;
                                }
                            }
                        }
                    }
                }
                if (!foundName) {
                    const chat = store.Chat?.get(pJid);
                    if (chat?.contact) {
                        if (isValid(chat.contact.pushname))
                            foundName = chat.contact.pushname;
                        else if (isValid(chat.contact.verifiedName))
                            foundName = chat.contact.verifiedName;
                        if (!foundName && isValid(chat.name))
                            foundName = chat.name;
                    }
                }
                return {
                    success: !!foundName,
                    name: foundName,
                    phone: foundPhone,
                    participantCount,
                    isLargeGroup
                };
            }
            catch (e) {
                return { success: false, name: null, phone: null, error: e.message };
            }
        }, participantJid, groupJid);
        if (result.success && result.name) {
            const groupInfo = result.isLargeGroup ? ` [Grupo grande: ${result.participantCount} miembros]` : '';
            logger.info(`✅ [FORCE LOAD] Datos cargados exitosamente: "${result.name}" (${result.phone || 'no phone'})${groupInfo}`);
            return { name: result.name, phone: result.phone };
        }
        else {
            logger.warn(`⚠️ [FORCE LOAD] No se pudieron cargar datos: ${result.error || 'sin nombre'}`);
            return { name: null, phone: null };
        }
    }
    catch (err) {
        logger.debug(`[FORCE LOAD] Error: ${err.message}`);
        return { name: null, phone: null };
    }
}
export async function forceGroupMetadataSync(client, groupId) {
    if (!client?.pupPage)
        return false;
    try {
        const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
        logger.info(`🔄 [FORCE SYNC] Forzando sincronización de metadatos para grupo ${groupId}...`);
        const result = await client.pupPage.evaluate(async (gJid) => {
            try {
                const store = window.Store;
                if (!store)
                    return { success: false, error: 'Store not available' };
                const chat = store.Chat?.get(gJid);
                if (!chat)
                    return { success: false, error: 'Chat not found' };
                if (store.Cmd) {
                    try {
                        if (store.Cmd.openChatBottom) {
                            await store.Cmd.openChatBottom(chat);
                        }
                        if (store.Cmd.openDrawerMid) {
                            await store.Cmd.openDrawerMid(chat);
                        }
                        else if (store.Cmd.openCurrentChatInfo) {
                            await store.Cmd.openCurrentChatInfo();
                        }
                        await new Promise(r => setTimeout(r, 1500));
                        if (store.Cmd.closeDrawerRight) {
                            await store.Cmd.closeDrawerRight();
                        }
                        else if (store.Cmd.closeActiveChat) {
                        }
                        return { success: true, method: 'Cmd.openDrawerMid' };
                    }
                    catch (cmdErr) {
                    }
                }
                if (store.GroupMetadata && typeof store.GroupMetadata.queryAndUpdate === 'function') {
                    try {
                        await store.GroupMetadata.queryAndUpdate(gJid);
                        await new Promise(r => setTimeout(r, 1000));
                        return { success: true, method: 'GroupMetadata.queryAndUpdate' };
                    }
                    catch (e) { }
                }
                if (chat.groupMetadata && typeof chat.groupMetadata.refresh === 'function') {
                    try {
                        await chat.groupMetadata.refresh();
                        await new Promise(r => setTimeout(r, 1000));
                        return { success: true, method: 'groupMetadata.refresh' };
                    }
                    catch (e) { }
                }
                return { success: false, error: 'No sync method available' };
            }
            catch (e) {
                return { success: false, error: e.message };
            }
        }, groupJid);
        if (result.success) {
            logger.info(`✅ [FORCE SYNC] Sincronización forzada exitosa vía ${result.method}`);
            return true;
        }
        else {
            logger.warn(`⚠️ [FORCE SYNC] No se pudo forzar sincronización: ${result.error}`);
            return false;
        }
    }
    catch (err) {
        logger.debug(`[FORCE SYNC] Error: ${err.message}`);
        return false;
    }
}
export async function extractParticipantNameAfterSync(client, groupId, participantId) {
    if (!client?.pupPage)
        return { name: null, phone: null };
    try {
        const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
        const result = await client.pupPage.evaluate(async (gJid, pId) => {
            try {
                const store = window.Store;
                if (!store)
                    return null;
                const isValidName = (n) => {
                    if (!n || typeof n !== 'string')
                        return false;
                    const t = n.trim();
                    return t.length > 0 && t !== 'undefined' && t.toLowerCase() !== 'null';
                };
                if (store.Contact) {
                    const contact = store.Contact.get(pId);
                    if (contact) {
                        const name = contact.pushname || contact.verifiedName || contact.notifyName;
                        const phone = contact.number || contact.phoneNumber;
                        if (isValidName(name)) {
                            return { name, phone, source: 'Contact' };
                        }
                    }
                }
                if (store.GroupMetadata) {
                    const groupMeta = store.GroupMetadata.get(gJid);
                    if (groupMeta && groupMeta.participants) {
                        const participants = Array.isArray(groupMeta.participants)
                            ? groupMeta.participants
                            : (groupMeta.participants.getModelsArray ? groupMeta.participants.getModelsArray() : []);
                        if (Array.isArray(participants)) {
                            for (const p of participants) {
                                const pIdStr = p.id?._serialized || p.id;
                                if (pIdStr === pId) {
                                    const name = p.pushname || p.notify || p.name || p.contact?.pushname;
                                    const phone = p.number || p.contact?.number;
                                    if (isValidName(name)) {
                                        return { name, phone, source: 'GroupMetadata' };
                                    }
                                }
                            }
                        }
                    }
                }
                if (store.Chat) {
                    const chat = store.Chat.get(pId);
                    if (chat && chat.contact) {
                        const name = chat.contact.pushname || chat.contact.name;
                        if (isValidName(name)) {
                            return { name, phone: chat.contact.number, source: 'Chat.contact' };
                        }
                    }
                }
                if (store.WidFactory && pId.includes('@lid')) {
                    try {
                        const contact = store.Contact.get(pId);
                        if (contact && contact.wid) {
                            const widContact = store.Contact.get(contact.wid._serialized);
                            if (widContact && isValidName(widContact.pushname)) {
                                return {
                                    name: widContact.pushname,
                                    phone: widContact.number,
                                    source: 'WID mapping'
                                };
                            }
                        }
                    }
                    catch (e) { }
                }
                return null;
            }
            catch (e) {
                return null;
            }
        }, groupJid, participantId);
        if (result) {
            logger.info(`✅ Nombre extraído post-sync (${result.source}): "${result.name}"`);
            if (result.name) {
                lidNameCache.set(participantId, { name: result.name, timestamp: Date.now() });
            }
            return { name: result.name, phone: result.phone };
        }
        return { name: null, phone: null };
    }
    catch (err) {
        logger.debug(`[extractParticipantNameAfterSync] Error: ${err.message}`);
        return { name: null, phone: null };
    }
}
export async function resolveLidToPhone(client, groupId, lid) {
    if (!client || !groupId || !lid)
        return '';
    const cacheKey = `${groupId}:${lid}`;
    const cached = lidCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        logger.info(`✅ LID resuelto desde cache: ${lid} → ${cached.phone}`);
        return cached.phone;
    }
    try {
        const normalizedGroupId = normalizeGroupId(groupId);
        const groupJid = normalizedGroupId.includes('@') ? normalizedGroupId : `${normalizedGroupId}@g.us`;
        if (client.pupPage) {
            try {
                const result = await client.pupPage.evaluate(async (gJid, lidToResolve) => {
                    try {
                        const store = window.Store;
                        if (!store)
                            return null;
                        const lidPrefix = lidToResolve.replace('@lid', '').replace(/[^\d]/g, '');
                        if (store.GroupMetadata) {
                            const groupMeta = store.GroupMetadata.get(gJid);
                            if (groupMeta && groupMeta.participants) {
                                const participants = Array.isArray(groupMeta.participants)
                                    ? groupMeta.participants
                                    : (groupMeta.participants.getModelsArray ? groupMeta.participants.getModelsArray() : []);
                                if (Array.isArray(participants)) {
                                    for (const p of participants) {
                                        const pId = p.id?._serialized || p.id;
                                        if (pId === lidToResolve) {
                                            if (p.number && /^\d+$/.test(p.number)) {
                                                return { phone: p.number, name: p.pushname || p.notify, source: 'exact_match' };
                                            }
                                        }
                                    }
                                    for (const p of participants) {
                                        const pId = p.id?._serialized || p.id;
                                        const userPart = pId?.split('@')[0] || '';
                                        if (userPart.includes(lidPrefix)) {
                                            return { phone: userPart, name: p.pushname || p.notify, source: 'prefix_match' };
                                        }
                                    }
                                }
                            }
                        }
                        if (store.Contact) {
                            const contact = store.Contact.get(lidToResolve);
                            if (contact && contact.number) {
                                return { phone: contact.number, name: contact.pushname, source: 'contact' };
                            }
                        }
                        return null;
                    }
                    catch (e) {
                        return null;
                    }
                }, groupJid, lid);
                if (result && result.phone) {
                    const realPhone = normalizePhone(result.phone);
                    if (realPhone && realPhone.length >= 8 && realPhone.length <= 15) {
                        lidCache.set(cacheKey, { phone: realPhone, timestamp: Date.now() });
                        if (result.name) {
                            lidNameCache.set(lid, { name: result.name, timestamp: Date.now() });
                        }
                        logger.info(`✅ LID resuelto vía Puppeteer (${result.source}): ${lid} → ${realPhone}`);
                        return realPhone;
                    }
                }
            }
            catch (pupErr) {
                logger.debug(`Puppeteer LID resolution failed: ${pupErr.message}`);
            }
        }
        let chat;
        try {
            chat = await client.getChatById(groupJid);
        }
        catch (chatErr) {
            logger.warn(`⚠️ No se pudo resolver LID ${lid} en grupo ${normalizedGroupId}`);
            return '';
        }
        if (!chat || !chat.isGroup) {
            logger.warn(`⚠️ Chat ${normalizedGroupId} no es un grupo o no existe`);
            return '';
        }
        const participants = chat.participants || [];
        const lidPrefix = lid.replace('@lid', '').replace(/[^\d]/g, '');
        logger.debug(`🔍 Buscando LID ${lid} (prefix: ${lidPrefix}) entre ${participants.length} participantes`);
        for (const participant of participants) {
            const participantId = participant.id?._serialized || participant.id;
            if (participantId === lid) {
                const rawName = participant.pushname || participant.notify || participant.name;
                if (rawName) {
                    logger.info(`ℹ️ LID encontrado en participantes con nombre: ${rawName}`);
                    lidNameCache.set(lid, { name: rawName, timestamp: Date.now() });
                }
            }
        }
        for (const participant of participants) {
            const participantId = participant.id?._serialized || participant.id;
            const userPart = participant.id?.user || participantId.split('@')[0];
            if (userPart && userPart.includes(lidPrefix)) {
                const realPhone = normalizePhone(userPart);
                if (realPhone && realPhone.length >= 8 && realPhone.length <= 15 && !realPhone.includes('@')) {
                    lidCache.set(cacheKey, { phone: realPhone, timestamp: Date.now() });
                    logger.info(`✅ LID resuelto (prefix match): ${lid} → ${realPhone}`);
                    return realPhone;
                }
            }
        }
        logger.warn(`⚠️ No se pudo resolver LID ${lid} en grupo ${normalizedGroupId}`);
        logger.debug(`Primeros 5 participantes: ${participants.slice(0, 5).map(p => p.id?._serialized || p.id).join(', ')}`);
        return '';
    }
    catch (error) {
        logger.error(`❌ Error al resolver LID ${lid}:`, error);
        return '';
    }
}
export function getCachedLidName(lid) {
    const cached = lidNameCache.get(lid);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.name;
    }
    return null;
}
export function clearLidCache() {
    const now = Date.now();
    let cleared = 0;
    for (const [key, value] of lidCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            lidCache.delete(key);
            cleared++;
        }
    }
    for (const [key, value] of lidNameCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            lidNameCache.delete(key);
            cleared++;
        }
    }
    if (cleared > 0) {
        logger.info(`🧹 Cache de LIDs limpiado: ${cleared} entradas eliminadas`);
    }
}
setInterval(clearLidCache, CACHE_TTL);
export default {
    resolveLidToPhone,
    clearLidCache,
    getCachedLidName,
    forceGroupMetadataSync,
    extractParticipantNameAfterSync
};
