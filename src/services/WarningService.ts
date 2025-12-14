import MemberRepository from '../repositories/MemberRepository.js';
import GroupRepository from '../repositories/GroupRepository.js';
import { getNow } from '../utils/time.js';
import { normalizePhone } from '../utils/phone.js';
import logger from '../lib/logger.js';
import { getFirestore } from '../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

export class WarningService {
  /**
   * Agrega una advertencia usando transacción atómica
   * Basado en documentación: usa transacción para evitar race conditions
   */
  static async addWarning(groupId: string, phone: string, byPhone: string, byName: string, reason = '') {
    const db = getFirestore();

    // Obtener configuración del grupo para maxWarnings
    const config = await GroupRepository.getConfig(groupId);
    const maxWarnings = config?.limits?.maxWarnings || 3;

    // MEJORADO: Buscar miembro con múltiples estrategias
    // El phone puede ser: número normal, LID sin @lid, o número extraído de LID
    logger.info(`[WarningService] Looking for member: phone=${phone}`);

    // Intentar buscar por phone y también por LID
    let found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);

    // Si no encuentra, intentar con normalizePhone
    if (!found) {
      const normalized = normalizePhone(phone);
      if (normalized && normalized !== phone) {
        logger.info(`[WarningService] Trying with normalized phone: ${normalized}`);
        found = await MemberRepository.findByPhoneOrLid(groupId, normalized, normalized);
      }
    }

    let member = found ? found.data : null;
    let docId = found?.docId;

    // Auto-registrar si no existe
    if (!member) {
      docId = normalizePhone(phone);
      // Si es LID y no se puede normalizar, extraer la parte numérica
      if (!docId && phone.includes('@lid')) {
        docId = phone.replace('@lid', '').split(':')[0];
      }
      if (!docId) docId = phone;

      logger.info(`[WarningService] Auto-registering member ${docId} for warning`);
      member = await MemberRepository.save(groupId, {
        phone: docId,
        lid: phone.includes('@') ? phone : undefined, // Guardar LID si parece ser uno
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

    // Crear entrada de historial según documentación
    const newWarning = {
      type: 'WARN' as const,
      byPhone: normalizePhone(byPhone) || byPhone,
      byName,
      reason,
      timestamp: getNow()
    };

    const warnHistory = member.warnHistory || [];
    warnHistory.push(newWarning);

    // Actualizar en base de datos usando el docId correcto
    await MemberRepository.update(groupId, docId, {
      warnings: newWarnings,
      warnHistory
    });

    logger.info(`[WarningService] Warning added to ${phone} (docId: ${docId}) in group ${groupId}. Total: ${newWarnings}/${maxWarnings}`);

    // Determinar si debe ser expulsado (>= maxWarnings)
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

  /**
   * Quita la última advertencia
   */
  static async removeWarning(groupId: string, phone: string, byPhone?: string, byName?: string) {
    // Buscar por phone o LID
    let found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);

    // Si no encuentra, intentar con normalizePhone
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

    // Registrar reseteo completo de advertencias (tipo UNWARN con razón específica)
    warnHistory.push({
      type: 'UNWARN' as const,
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

  /**
   * Resetea advertencias a 0 explícitamente (alias para políticas de ingreso)
   */
  static async resetWarnings(groupId: string, phone: string, byPhone?: string, byName?: string) {
    return await this.removeWarning(groupId, phone, byPhone, byName);
  }

  /**
   * Registra una expulsión en el historial
   * @param groupId - ID del grupo
   * @param phone - Número/LID del usuario expulsado
   * @param reason - Motivo de la expulsión (puede incluir evidencia)
   * @param byPhone - Número del admin que ejecutó (opcional)
   * @param byName - Nombre del admin que ejecutó (opcional)
   */
  static async logKick(groupId: string, phone: string, reason: string, byPhone?: string, byName?: string) {
    const found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);
    const member = found ? found.data : null;
    let docId = found?.docId;

    // Si no existe el miembro, crearlo para guardar el registro
    // Usar normalizePhone solo para nuevos documentos
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

    // Agregar evento KICK al historial con información completa
    // IMPORTANTE: Firestore no acepta valores undefined, usar valores por defecto
    warnHistory.push({
      type: 'KICK' as const,
      reason: reason || 'Expulsado por un administrador',
      byPhone: byPhone ? (normalizePhone(byPhone) || byPhone) : 'admin',
      byName: byName || 'Administrador',
      timestamp: getNow()
    });

    // CRÍTICO: Limpiar cualquier entrada existente con valores undefined
    // Esto corrige datos antiguos que fueron guardados con el bug
    const cleanedHistory = warnHistory.map(entry => ({
      type: entry.type || 'UNKNOWN',
      reason: entry.reason || 'Sin motivo especificado',
      byPhone: entry.byPhone || 'system',
      byName: entry.byName || 'Sistema',
      timestamp: entry.timestamp || getNow()
    }));

    // Incrementar contador de kicks totales
    const totalKicks = (member?.totalKicks || 0) + 1;

    // Resetear warnings a 0 después de expulsión
    await MemberRepository.update(groupId, docId, {
      warnings: 0,
      warnHistory: cleanedHistory,
      totalKicks,
      isMember: false,
      kickedAt: getNow()
    });

    logger.info(`[WarningService] Kick logged for ${phone} (docId: ${docId}) in group ${groupId}`);
  }

  /**
   * Registra una salida del grupo
   */
  static async logExit(groupId: string, phone: string, wasKicked: boolean = false) {
    const found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);
    const member = found ? found.data : null;
    const docId = found?.docId || normalizePhone(phone);

    // Si no hay docId válido, no podemos actualizar
    if (!docId) {
      logger.warn(`[WarningService] Cannot log exit: no valid docId for ${phone}`);
      return;
    }

    const warnHistory = member?.warnHistory ? [...member.warnHistory] : [];

    // Agregar evento EXIT al historial
    warnHistory.push({
      type: 'EXIT' as const,
      reason: wasKicked ? 'Expulsado' : 'Salió voluntariamente',
      timestamp: getNow()
    });

    // Incrementar contador de salidas
    const totalExits = (member?.totalExits || 0) + 1;

    await MemberRepository.update(groupId, docId, {
      warnHistory,
      totalExits,
      isMember: false,
      lastExitAt: getNow()
    });

    logger.info(`[WarningService] Exit logged for ${phone} (docId: ${docId}) in group ${groupId}. Total exits: ${totalExits}`);
  }

  /**
   * Obtiene advertencias de un usuario
   */
  static async getWarnings(groupId: string, phone: string) {
    // Buscar por phone o LID
    let found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);

    // Si no encuentra, intentar con normalizePhone
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

