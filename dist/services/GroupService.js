import GroupRepository from '../repositories/GroupRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import MessageRepository from '../repositories/MessageRepository.js';
import { DEFAULT_GROUP_CONFIG } from '../config/constants.js';
import { getNow } from '../utils/time.js';
import { normalizePhone, normalizeGroupId, extractIdFromWid } from '../utils/phone.js';
import logger from '../lib/logger.js';
export class GroupService {
    static async createOrUpdateGroup(chat) {
        const startTime = Date.now();
        const groupId = normalizeGroupId(chat.id._serialized);
        try {
            logger.info(`[${new Date().toISOString()}] [GROUP SYNC] Syncing group metadata for ${groupId}`);
            const groupData = await this.extractCompleteMetadata(chat);
            await GroupRepository.save(groupData);
            const duration = Date.now() - startTime;
            logger.info(`[${new Date().toISOString()}] [WRITE] groups/${groupId} → SUCCESS (${duration}ms)`);
            return groupData;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`[${new Date().toISOString()}] [ERROR] Failed to sync group ${groupId} (${duration}ms)`, error);
            throw error;
        }
    }
    static async extractCompleteMetadata(chat) {
        const groupId = normalizeGroupId(chat.id._serialized);
        const now = getNow();
        const existingGroup = await GroupRepository.getById(groupId);
        const metadata = {
            id: groupId,
            name: chat.name || 'Sin nombre',
            description: chat.description || '',
            owner: chat.owner?._serialized || chat.owner || null,
            creationTimestamp: chat.createdAt || chat.timestamp || null,
            isReadOnly: chat.isReadOnly || false,
            announce: chat.announce || false,
            restrict: chat.restrict || false,
            inviteCode: null,
            isActive: existingGroup?.isActive ?? true,
            isBotAdmin: this.isBotAdmin(chat),
            memberCount: chat.participants?.length || 0,
            adminCount: chat.participants?.filter(p => p.isAdmin || p.isSuperAdmin).length || 0,
            totalMessages: existingGroup?.totalMessages || 0,
            totalPoints: existingGroup?.totalPoints || 0,
            totalCommandsExecuted: existingGroup?.totalCommandsExecuted || 0,
            totalPremiumCommandsPurchased: existingGroup?.totalPremiumCommandsPurchased || 0,
            totalRedemptions: existingGroup?.totalRedemptions || 0,
            createdAt: existingGroup?.createdAt || now,
            activatedAt: existingGroup?.activatedAt || now,
            lastActivityAt: existingGroup?.lastActivityAt || now,
            lastSyncAt: now,
            updatedAt: now,
            config: existingGroup?.config || DEFAULT_GROUP_CONFIG
        };
        return metadata;
    }
    static isBotAdmin(chat) {
        return false;
    }
    static async activateGroup(groupId, groupMetadata, sock = null) {
        try {
            groupId = normalizeGroupId(groupId);
            if (!groupId) {
                throw new Error('groupId inválido');
            }
            logger.info(`[${new Date().toISOString()}] [GROUP ACTIVATION] Activating group ${groupId}`);
            let group = await GroupRepository.getById(groupId);
            if (group?.isActive) {
                logger.info(`[bot] Grupo ya activo: ${groupId}`);
                return { outcome: 'ALREADY_ACTIVE', group };
            }
            const groupData = {
                id: groupId,
                name: groupMetadata.subject || 'Sin nombre',
                description: groupMetadata.desc || '',
                isActive: true,
                phone: normalizePhone(groupId),
                activatedAt: getNow(),
                memberCount: groupMetadata.participants?.length || 0,
                totalMessages: group?.totalMessages || 0,
                totalPoints: group?.totalPoints || 0,
                config: group?.config || DEFAULT_GROUP_CONFIG
            };
            if (!group) {
                groupData.createdAt = getNow();
            }
            await GroupRepository.save(groupData);
            const membersRegistered = [];
            if (false && groupMetadata.participants && groupMetadata.participants.length > 0) {
                logger.info(`📋 Iniciando registro de ${groupMetadata.participants.length} miembros...`);
                for (const participant of groupMetadata.participants) {
                    try {
                        const participantId = extractIdFromWid(participant.id);
                        if (!participantId) {
                            logger.warn(`⚠️ Skipping participant: no ID extracted`);
                            continue;
                        }
                        let phoneNumber = normalizePhone(participantId);
                        if (!phoneNumber && participantId.includes('@lid') && sock) {
                            try {
                                const contact = await sock.getContactById(participantId);
                                if (contact && contact.id) {
                                    phoneNumber = normalizePhone(contact.id);
                                    if (phoneNumber) {
                                        logger.info(`🔄 Participant LID resolved via Contact: ${participantId} → ${phoneNumber}`);
                                    }
                                }
                            }
                            catch (error) {
                                logger.warn(`⚠️ Error al resolver participant LID via Contact: ${participantId}`, error.message);
                            }
                        }
                        if (!phoneNumber) {
                            logger.warn(`⚠️ Skipping participant ${participantId}: no se pudo obtener número válido`);
                            continue;
                        }
                        if (phoneNumber === groupId) {
                            logger.warn(`⚠️ Skipping participant: phone matches groupId`);
                            continue;
                        }
                        const now = getNow();
                        const memberData = {
                            phone: phoneNumber,
                            displayName: participant.notify || phoneNumber,
                            pushname: participant.notify || phoneNumber,
                            role: participant.admin ? 'admin' : 'member',
                            isMember: true,
                            isAdmin: participant.admin || false,
                            isSuperAdmin: participant.isSuperAdmin || false,
                            points: 0,
                            lifetimePoints: 0,
                            messageCount: 0,
                            totalMessagesCount: 0,
                            currentLevel: 1,
                            messagesForNextPoint: 0,
                            warnings: 0,
                            warnHistory: [],
                            createdAt: now,
                            joinedAt: now,
                            updatedAt: now,
                            lastMessageAt: null,
                            leftAt: null,
                            stats: {
                                totalPointsEarned: 0,
                                totalPointsSpent: 0,
                                totalRewardsRedeemed: 0,
                                firstMessageDate: now,
                                lastActiveDate: now,
                                averageMessagesPerDay: 0,
                                longestStreak: 0,
                                currentStreak: 0
                            },
                            preferences: {
                                language: 'es',
                                notificationsEnabled: true,
                                levelUpNotifications: true
                            }
                        };
                        await MemberRepository.save(groupId, memberData);
                        membersRegistered.push(phoneNumber);
                        logger.debug(`✅ Member registered: ${phoneNumber} (${memberData.displayName})`);
                    }
                    catch (error) {
                        logger.error(`Error registering member ${participant.id}:`, error);
                    }
                }
                logger.info(`✅ ${membersRegistered.length} miembros registrados exitosamente`);
            }
            logger.info(`Grupo activado: ${groupId}`);
            return { outcome: 'ACTIVATED', group: groupData, members: membersRegistered };
        }
        catch (error) {
            logger.error(`Error al activar grupo ${groupId}:`, error);
            throw error;
        }
    }
    static async deactivateGroup(groupId) {
        groupId = normalizeGroupId(groupId);
        await GroupRepository.update(groupId, {
            isActive: false,
            deactivatedAt: getNow()
        });
        logger.info(`Grupo desactivado: ${groupId}`);
    }
    static async getGroupInfo(groupId) {
        groupId = normalizeGroupId(groupId);
        const group = await GroupRepository.getById(groupId);
        if (!group)
            return null;
        const config = await GroupRepository.getConfig(groupId);
        const members = await MemberRepository.getActiveMembers(groupId);
        const messages = await MessageRepository.countByGroup(groupId);
        return {
            ...group,
            config,
            memberCount: members.length,
            totalMessages: messages
        };
    }
}
export default GroupService;
