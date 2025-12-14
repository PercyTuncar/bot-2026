import MemberRepository from '../repositories/MemberRepository.js';
import GroupRepository from '../repositories/GroupRepository.js';
import { getNow } from '../utils/time.js';
import { normalizePhone } from '../utils/phone.js';
import logger from '../lib/logger.js';
import { getFirestore } from '../config/firebase.js';
export class WarningService {
    static async addWarning(groupId, phone, byPhone, byName, reason = '') {
        const db = getFirestore();
        const config = await GroupRepository.getConfig(groupId);
        const maxWarnings = config?.limits?.maxWarnings || 3;
        logger.info(`[WarningService] Looking for member: phone=${phone}`);
        let found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);
        if (!found) {
            const normalized = normalizePhone(phone);
            if (normalized && normalized !== phone) {
                logger.info(`[WarningService] Trying with normalized phone: ${normalized}`);
                found = await MemberRepository.findByPhoneOrLid(groupId, normalized, normalized);
            }
        }
        let member = found ? found.data : null;
        let docId = found?.docId;
        if (!member) {
            docId = normalizePhone(phone);
            if (!docId && phone.includes('@lid')) {
                docId = phone.replace('@lid', '').split(':')[0];
            }
            if (!docId)
                docId = phone;
            logger.info(`[WarningService] Auto-registering member ${docId} for warning`);
            member = await MemberRepository.save(groupId, {
                phone: docId,
                lid: phone.includes('@') ? phone : undefined,
                displayName: docId,
                isMember: true,
                role: 'member',
                warnings: 0,
                warnHistory: []
            });
        }
        if (!docId) {
            logger.error(`[WarningService] Cannot add warning: no valid docId for ${phone}`);
            throw new Error('No se pudo identificar al usuario para agregar advertencia');
        }
        const currentWarnings = member.warnings || 0;
        const newWarnings = currentWarnings + 1;
        const newWarning = {
            type: 'WARN',
            byPhone: normalizePhone(byPhone) || byPhone,
            byName,
            reason,
            timestamp: getNow()
        };
        const warnHistory = member.warnHistory || [];
        warnHistory.push(newWarning);
        await MemberRepository.update(groupId, docId, {
            warnings: newWarnings,
            warnHistory
        });
        logger.info(`[WarningService] Warning added to ${phone} (docId: ${docId}) in group ${groupId}. Total: ${newWarnings}/${maxWarnings}`);
        const shouldKick = newWarnings >= maxWarnings;
        if (shouldKick) {
            logger.info(`[WarningService] User ${phone} reached ${newWarnings}/${maxWarnings} warnings - SHOULD BE KICKED`);
        }
        return {
            warnings: newWarnings,
            maxWarnings,
            shouldKick,
            history: warnHistory
        };
    }
    static async removeWarning(groupId, phone, byPhone, byName) {
        let found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);
        if (!found) {
            const normalized = normalizePhone(phone);
            if (normalized && normalized !== phone) {
                found = await MemberRepository.findByPhoneOrLid(groupId, normalized, normalized);
            }
        }
        let member = found ? found.data : null;
        let docId = found?.docId;
        if (!member) {
            throw new Error('Usuario no encontrado');
        }
        if (!docId) {
            throw new Error('No se pudo identificar al usuario');
        }
        const warnHistory = member.warnHistory ? [...member.warnHistory] : [];
        warnHistory.push({
            type: 'UNWARN',
            byPhone: byPhone ? (normalizePhone(byPhone) || byPhone) : 'system',
            byName: byName || 'Sistema',
            reason: 'Advertencias reseteadas a 0',
            timestamp: getNow()
        });
        if (!member || !docId) {
            await MemberRepository.mergeMemberDocs(groupId, normalizePhone(phone) || phone, phone);
            const reFound = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);
            member = reFound ? reFound.data : null;
            docId = reFound?.docId;
            if (!member || !docId) {
                throw new Error('No se pudo identificar al usuario');
            }
        }
        await MemberRepository.update(groupId, docId, {
            warnings: 0,
            warnHistory
        });
        logger.info(`[WarningService] Warnings reset for ${phone} (docId: ${docId}) in group ${groupId}. Remaining: 0`);
        return {
            warnings: 0,
            history: warnHistory
        };
    }
    static async resetWarnings(groupId, phone, byPhone, byName) {
        return await this.removeWarning(groupId, phone, byPhone, byName);
    }
    static async logKick(groupId, phone, reason, byPhone, byName) {
        const found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);
        const member = found ? found.data : null;
        let docId = found?.docId;
        if (!member) {
            docId = normalizePhone(phone) || phone.replace('@lid', '').split(':')[0];
            if (!docId) {
                logger.warn(`[WarningService] Cannot log kick: no valid docId for ${phone}`);
                return;
            }
            await MemberRepository.save(groupId, {
                phone: docId,
                displayName: docId,
                isMember: false,
                role: 'member',
                warnings: 0,
                warnHistory: []
            });
        }
        if (!docId) {
            logger.warn(`[WarningService] Cannot log kick: docId not resolved for ${phone}`);
            return;
        }
        const warnHistory = member?.warnHistory ? [...member.warnHistory] : [];
        warnHistory.push({
            type: 'KICK',
            reason: reason || 'Expulsado por un administrador',
            byPhone: byPhone ? (normalizePhone(byPhone) || byPhone) : 'admin',
            byName: byName || 'Administrador',
            timestamp: getNow()
        });
        const cleanedHistory = warnHistory.map(entry => ({
            type: entry.type || 'UNKNOWN',
            reason: entry.reason || 'Sin motivo especificado',
            byPhone: entry.byPhone || 'system',
            byName: entry.byName || 'Sistema',
            timestamp: entry.timestamp || getNow()
        }));
        const totalKicks = (member?.totalKicks || 0) + 1;
        await MemberRepository.update(groupId, docId, {
            warnings: 0,
            warnHistory: cleanedHistory,
            totalKicks,
            isMember: false,
            kickedAt: getNow()
        });
        logger.info(`[WarningService] Kick logged for ${phone} (docId: ${docId}) in group ${groupId}`);
    }
    static async logExit(groupId, phone, wasKicked = false) {
        const found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);
        const member = found ? found.data : null;
        const docId = found?.docId || normalizePhone(phone);
        if (!docId) {
            logger.warn(`[WarningService] Cannot log exit: no valid docId for ${phone}`);
            return;
        }
        const warnHistory = member?.warnHistory ? [...member.warnHistory] : [];
        warnHistory.push({
            type: 'EXIT',
            reason: wasKicked ? 'Expulsado' : 'Salió voluntariamente',
            timestamp: getNow()
        });
        const totalExits = (member?.totalExits || 0) + 1;
        await MemberRepository.update(groupId, docId, {
            warnHistory,
            totalExits,
            isMember: false,
            lastExitAt: getNow()
        });
        logger.info(`[WarningService] Exit logged for ${phone} (docId: ${docId}) in group ${groupId}. Total exits: ${totalExits}`);
    }
    static async getWarnings(groupId, phone) {
        let found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);
        if (!found) {
            const normalized = normalizePhone(phone);
            if (normalized && normalized !== phone) {
                found = await MemberRepository.findByPhoneOrLid(groupId, normalized, normalized);
            }
        }
        const member = found ? found.data : null;
        if (!member) {
            return null;
        }
        return {
            total: member.warnings || 0,
            history: member.warnHistory || [],
            totalExits: member.totalExits || 0
        };
    }
}
export default WarningService;
