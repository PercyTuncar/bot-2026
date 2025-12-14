import PointsRepository from '../repositories/PointsRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import GroupRepository from '../repositories/GroupRepository.js';
import { config } from '../config/environment.js';
import { isValidMessageForPoints } from '../utils/validator.js';
import { checkLevelUp } from '../utils/levels.js';
import logger from '../lib/logger.js';
const lastPointTime = new Map();
const messageTimestamps = new Map();
export class PointsService {
    static async processMessage(groupId, msg, userPhone = null) {
        if (!config.points.enabled) {
            return null;
        }
        if (!isValidMessageForPoints(msg, config.bot.prefix)) {
            return null;
        }
        const now = Date.now();
        try {
            const userId = userPhone;
            if (!userId) {
                logger.warn(`PointsService: No se recibió userPhone`);
                return null;
            }
            const isLid = userId.includes('@lid');
            const phoneForSearch = isLid ? null : userId;
            const lidForSearch = isLid ? userId : null;
            const found = await MemberRepository.findByPhoneOrLid(groupId, phoneForSearch, lidForSearch);
            if (!found || !found.data || !found.data.isMember) {
                logger.warn(`PointsService: Member not found for userId=${userId}`);
                return null;
            }
            const phone = found.docId;
            const member = found.data;
            const remoteJid = msg.to || msg.from;
            const isGroup = remoteJid?.endsWith('@g.us');
            if (isGroup && !phone.includes('@lid')) {
                const rawGroupId = remoteJid.replace('@g.us', '');
                if (phone === rawGroupId)
                    return null;
            }
            const userMessages = messageTimestamps.get(phone) || [];
            const recentMessages = userMessages.filter(ts => now - ts < 1000);
            if (recentMessages.length >= 5) {
                logger.warn(`Anti-flood: ${phone} envió ${recentMessages.length} mensajes en 1 segundo, ignorando`);
                messageTimestamps.set(phone, recentMessages.slice(-10));
                return null;
            }
            recentMessages.push(now);
            messageTimestamps.set(phone, recentMessages.slice(-20));
            const lastPoint = lastPointTime.get(phone);
            const timeSinceLastPoint = lastPoint ? (now - lastPoint) : Infinity;
            const startTime = Date.now();
            await PointsRepository.incrementMessageCounter(groupId, phone);
            logger.info(`[${new Date().toISOString()}] [INCREMENT] groups/${groupId}/members/${phone}.messagesForNextPoint → SUCCESS (${Date.now() - startTime}ms)`);
            const foundUpdated = await MemberRepository.findByPhoneOrLid(groupId, phone, null);
            const updatedMember = foundUpdated ? foundUpdated.data : null;
            if (!updatedMember || !updatedMember.isMember) {
                return null;
            }
            const newCounter = updatedMember.messagesForNextPoint || 0;
            const groupConfig = await GroupRepository.getConfig(groupId);
            const group = await GroupRepository.getById(groupId);
            const messagesPerPoint = groupConfig?.messagesPerPoint
                || groupConfig?.points?.perMessages
                || group?.config?.messagesPerPoint
                || group?.config?.points?.perMessages
                || config.points.perMessages;
            if (newCounter >= messagesPerPoint) {
                if (timeSinceLastPoint < 1000) {
                    logger.info(`Rate limit: ${phone} intentó ganar punto muy rápido (${Math.round(timeSinceLastPoint / 1000)}s desde último)`);
                    await MemberRepository.update(groupId, phone, {
                        messagesForNextPoint: newCounter
                    });
                    return {
                        pointsAdded: false,
                        messagesForNextPoint: newCounter,
                        messagesNeeded: 0,
                        rateLimited: true
                    };
                }
                const pointStartTime = Date.now();
                await PointsRepository.addPoints(groupId, phone, 1);
                logger.info(`[${new Date().toISOString()}] [UPDATE] groups/${groupId}/members/${phone}.points +1 → SUCCESS (${Date.now() - pointStartTime}ms)`);
                const resetStartTime = Date.now();
                await PointsRepository.resetMessageCounter(groupId, phone);
                logger.info(`[${new Date().toISOString()}] [UPDATE] groups/${groupId}/members/${phone}.messagesForNextPoint RESET → SUCCESS (${Date.now() - resetStartTime}ms)`);
                lastPointTime.set(phone, now);
                const foundUpdated = await MemberRepository.findByPhoneOrLid(groupId, phone, null);
                const updatedMember = foundUpdated ? foundUpdated.data : null;
                const newPoints = updatedMember?.points || 0;
                const groupConfig = await GroupRepository.getConfig(groupId);
                const levels = groupConfig?.levels || (await GroupRepository.getById(groupId))?.config?.levels;
                const oldPoints = newPoints - 1;
                const levelUpInfo = checkLevelUp(oldPoints, newPoints, levels);
                if (levelUpInfo && levelUpInfo.leveled) {
                    await MemberRepository.update(groupId, phone, {
                        currentLevel: levelUpInfo.newLevel.level
                    });
                    logger.info(`🎉 ${phone} subió al nivel ${levelUpInfo.newLevel.level} (${levelUpInfo.newLevel.name})`);
                }
                logger.info(`Punto agregado a ${phone} en grupo ${groupId}. Total: ${newPoints}`);
                const pointsName = groupConfig?.pointsName
                    || group?.config?.points?.name
                    || config.points.name;
                return {
                    pointsAdded: true,
                    newPoints,
                    message: `\n\n🎉 *¡PUNTO GANADO!* 🎉\n\n` +
                        `✨ Has obtenido *+1 ${pointsName}*\n` +
                        `💰 Total acumulado: *${newPoints} ${pointsName}*\n\n` +
                        `¡Sigue participando! 🚀`,
                    levelUp: levelUpInfo
                };
            }
            else {
                await MemberRepository.update(groupId, phone, {
                    messagesForNextPoint: newCounter
                });
                return {
                    pointsAdded: false,
                    messagesForNextPoint: newCounter,
                    messagesNeeded: messagesPerPoint - newCounter
                };
            }
        }
        catch (error) {
            logger.error(`Error al procesar puntos:`, error);
            return null;
        }
    }
    static async setPoints(groupId, phone, points) {
        const startTime = Date.now();
        await PointsRepository.setPoints(groupId, phone, points);
        logger.info(`[${new Date().toISOString()}] [UPDATE] groups/${groupId}/members/${phone}.points SET to ${points} → SUCCESS (${Date.now() - startTime}ms)`);
    }
    static async resetPoints(groupId, phone) {
        const startTime = Date.now();
        await PointsRepository.resetPoints(groupId, phone);
        await PointsRepository.resetMessageCounter(groupId, phone);
        logger.info(`[${new Date().toISOString()}] [UPDATE] groups/${groupId}/members/${phone}.points RESET → SUCCESS (${Date.now() - startTime}ms)`);
    }
}
export default PointsService;
