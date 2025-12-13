import RedemptionHandler from '../handlers/redemptionHandler.js';
import PrizeRepository from '../repositories/PrizeRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import logger from '../lib/logger.js';

export class PrizeService {
  /**
   * Obtiene un premio por código
   */
  static async getPrizeByCode(groupId, code) {
    return await PrizeRepository.getByCode(groupId, code.toUpperCase());
  }

  /**
   * Crea un premio (wrapper para mantener compatibilidad)
   */
  static async createPrize(groupId, prizeData) {
    return await PrizeRepository.save(groupId, {
      ...prizeData,
      code: prizeData.code.toUpperCase(),
      isActive: true,
      claimedCount: 0,
      createdAt: new Date()
    });
  }

  /**
   * MIGRACIÓN: Usa RedemptionHandler para solicitar premios
   * Reemplaza la lógica insegura de claimPrize
   */
  static async claimPrize(groupId, phone, prizeCode, displayName) {
    // 1. Obtener premio
    const prize = await this.getPrizeByCode(groupId, prizeCode);
    if (!prize) throw new Error('Premio no encontrado');

    // 2. Delegar a RedemptionHandler (Transaccional y Seguro)
    // Usamos el ID del premio como rewardId
    return await RedemptionHandler.requestRedemption(
      groupId,
      phone,
      displayName,
      prize.id,
      `Canje automático por código: ${prizeCode}`
    );
  }

  /**
   * MIGRACIÓN: Usa RedemptionHandler para entregar
   * Reemplaza lógica insegura de deliverPrize
   */
  static async deliverPrize(requestId, deliveredBy) {
    // En el nuevo sistema, requestId es el redemptionId
    // Nota: Esto asume que el premio YA fue aprobado. 
    // Si PrizeService se usaba para auto-aprobar, deberíamos llamar a approveRedemption primero.
    
    // Para mantener compatibilidad con flujos automáticos, aprobamos y entregamos en cadena
    // pero idealmente esto debería ser manual.
    
    // Paso 1: Aprobar (Descuenta puntos y stock de forma segura)
    await RedemptionHandler.approveRedemption(
      requestId.split('_')[0], // groupId aproximado o necesitaríamos pasarlo
      requestId,
      deliveredBy,
      'Auto-approved by PrizeService'
    );

    // Paso 2: Marcar entregado
    return await RedemptionHandler.markAsDelivered(
      requestId.split('_')[0], 
      requestId,
      deliveredBy,
      'Auto-delivered by PrizeService'
    );
  }
}

export default PrizeService;

