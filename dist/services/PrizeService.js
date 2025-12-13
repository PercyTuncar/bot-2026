import RedemptionHandler from '../handlers/redemptionHandler.js';
import PrizeRepository from '../repositories/PrizeRepository.js';
export class PrizeService {
    static async getPrizeByCode(groupId, code) {
        return await PrizeRepository.getByCode(groupId, code.toUpperCase());
    }
    static async createPrize(groupId, prizeData) {
        return await PrizeRepository.save(groupId, {
            ...prizeData,
            code: prizeData.code.toUpperCase(),
            isActive: true,
            claimedCount: 0,
            createdAt: new Date()
        });
    }
    static async claimPrize(groupId, phone, prizeCode, displayName) {
        const prize = await this.getPrizeByCode(groupId, prizeCode);
        if (!prize)
            throw new Error('Premio no encontrado');
        return await RedemptionHandler.requestRedemption(groupId, phone, displayName, prize.id, `Canje automático por código: ${prizeCode}`);
    }
    static async deliverPrize(requestId, deliveredBy) {
        await RedemptionHandler.approveRedemption(requestId.split('_')[0], requestId, deliveredBy, 'Auto-approved by PrizeService');
        return await RedemptionHandler.markAsDelivered(requestId.split('_')[0], requestId, deliveredBy, 'Auto-delivered by PrizeService');
    }
}
export default PrizeService;
