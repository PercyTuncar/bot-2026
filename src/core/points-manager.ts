import MemberRepository from '../repositories/MemberRepository.js';
import { normalizePhone } from '../utils/phone.js';

export class PointsManager {
  /**
   * Verifica si un usuario tiene puntos suficientes
   */
  static async hasEnoughPoints(groupId, phone, requiredPoints) {
    const normalized = normalizePhone(phone);
    const found = await MemberRepository.findByPhoneOrLid(groupId, normalized, normalized);
    const member = found ? found.data : null;
    
    if (!member || !member.isMember) {
      return false;
    }

    return (member.points || 0) >= requiredPoints;
  }

  /**
   * Obtiene puntos de un usuario
   */
  static async getPoints(groupId, phone) {
    const normalized = normalizePhone(phone);
    const found = await MemberRepository.findByPhoneOrLid(groupId, normalized, normalized);
    const member = found ? found.data : null;
    return member?.points || 0;
  }
}

export default PointsManager;

