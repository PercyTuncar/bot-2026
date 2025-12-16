import logger from '../lib/logger.js';
import { normalizePhone } from './phone.js';
const lidCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const lidNameCache = new Map();
export async function resolveLidToPhone(sock, groupId, lid) {
    if (!sock || !groupId || !lid)
        return '';
    const cacheKey = `${groupId}:${lid}`;
    const cached = lidCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        logger.info(`✅ LID resuelto desde cache: ${lid} → ${cached.phone}`);
        return cached.phone;
    }
    try {
        const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
        try {
            const metadata = await sock.groupMetadata(groupJid);
            if (metadata && metadata.participants) {
                const lidPrefix = lid.split('@')[0].replace(/[^\d]/g, '');
                for (const participant of metadata.participants) {
                    const participantId = participant.id || '';
                    const userPart = participantId.split('@')[0].split(':')[0];
                    if (participantId === lid || userPart.includes(lidPrefix)) {
                        const realPhone = normalizePhone(userPart);
                        if (realPhone && realPhone.length >= 8 && realPhone.length <= 15) {
                            lidCache.set(cacheKey, { phone: realPhone, timestamp: Date.now() });
                            logger.info(`✅ LID resuelto vía groupMetadata: ${lid} → ${realPhone}`);
                            return realPhone;
                        }
                    }
                }
            }
        }
        catch (e) {
            logger.debug(`groupMetadata failed for LID resolution: ${e.message}`);
        }
        if (sock.onWhatsApp) {
            try {
                const numericPart = lid.split('@')[0].replace(/[^\d]/g, '');
                if (numericPart.length >= 8) {
                    const result = await sock.onWhatsApp(numericPart);
                    if (result && result[0] && result[0].exists) {
                        const resolvedPhone = result[0].jid.split('@')[0];
                        lidCache.set(cacheKey, { phone: resolvedPhone, timestamp: Date.now() });
                        logger.info(`✅ LID resuelto vía onWhatsApp: ${lid} → ${resolvedPhone}`);
                        return resolvedPhone;
                    }
                }
            }
            catch (e) {
                logger.debug(`onWhatsApp failed for LID resolution: ${e.message}`);
            }
        }
        logger.warn(`⚠️ No se pudo resolver LID ${lid} en grupo ${groupId}`);
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
export function cacheLidName(lid, name) {
    if (lid && name) {
        lidNameCache.set(lid, { name, timestamp: Date.now() });
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
    cacheLidName
};
