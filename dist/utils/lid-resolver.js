import logger from '../lib/logger.js';
import { normalizePhone, normalizeGroupId } from './phone.js';
const lidCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
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
        const chat = await client.getChatById(groupJid);
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
export function clearLidCache() {
    const now = Date.now();
    let cleared = 0;
    for (const [key, value] of lidCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            lidCache.delete(key);
            cleared++;
        }
    }
    if (cleared > 0) {
        logger.info(`🧹 Cache de LIDs limpiado: ${cleared} entradas eliminadas`);
    }
}
setInterval(clearLidCache, CACHE_TTL);
export default { resolveLidToPhone, clearLidCache };
