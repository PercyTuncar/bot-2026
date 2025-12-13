import MessageRepository from '../repositories/MessageRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import GroupRepository from '../repositories/GroupRepository.js';
import { getNow } from '../utils/time.js';
import { normalizePhone, normalizeGroupId, getUserPhoneFromMessage, getDisplayNameFromMessage } from '../utils/phone.js';
import { config } from '../config/environment.js';
import logger from '../lib/logger.js';
import { getFirestore } from '../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
export class MessageService {
    static async saveMessage(groupId, msg, isCommand = false) {
        try {
            groupId = normalizeGroupId(groupId);
            if (groupId) {
                const group = await GroupRepository.getById(groupId);
                if (group && !group.isActive && !isCommand) {
                    logger.info(`🚫 Message not saved. Group ${groupId} is inactive.`);
                    return { saved: false, reason: 'group_inactive' };
                }
            }
            const remoteJid = msg.to || msg.from;
            if (!remoteJid)
                return false;
            const isGroup = remoteJid.endsWith('@g.us');
            const phone = getUserPhoneFromMessage(msg, isGroup);
            if (!phone || phone.includes('@') || phone.includes(':')) {
                logger.warn(`⚠️ No se pudo extraer número válido del mensaje. remoteJid: ${remoteJid}`);
                return false;
            }
            const text = msg.body || '';
            const displayName = getDisplayNameFromMessage(msg, phone);
            try {
                const memberExists = await MemberRepository.getByPhone(groupId, phone);
                if (!memberExists) {
                    logger.info(`👤 Auto-registering missing member: ${phone} in group ${groupId}`);
                    const now = getNow();
                    await MemberRepository.save(groupId, {
                        phone,
                        displayName,
                        isMember: true,
                        role: 'member',
                        points: 0,
                        messageCount: 0,
                        totalMessagesCount: 0,
                        currentLevel: 1,
                        messagesForNextPoint: 0,
                        warnings: 0,
                        warnHistory: [],
                        createdAt: now,
                        joinedAt: now,
                        leftAt: null,
                        lastMessageAt: null,
                        updatedAt: now,
                        stats: {
                            totalPointsEarned: 0,
                            totalPointsSpent: 0,
                            totalRewardsRedeemed: 0,
                            firstMessageDate: now,
                            averageMessagesPerDay: 0
                        }
                    });
                }
            }
            catch (regError) {
                logger.warn(`⚠️ Auto-registration failed for ${phone}:`, regError);
            }
            if (!config.messages.saveEnabled && !isCommand && !config.messages.saveOnlyCommands) {
                await MemberRepository.update(groupId, phone, {
                    lastMessageAt: getNow(),
                    displayName: displayName
                });
                return { saved: false, reason: 'message_saving_disabled' };
            }
            if (config.messages.saveOnlyCommands && !isCommand) {
                await MemberRepository.update(groupId, phone, {
                    lastMessageAt: getNow(),
                    displayName: displayName
                });
                return { saved: false, reason: 'only_commands_saved' };
            }
            let mentions = [];
            const mentionedJids = msg.mentionedJidList || [];
            if (mentionedJids.length > 0) {
                try {
                    const mentionPromises = mentionedJids.map(async (jid) => {
                        const mentionPhone = normalizePhone(jid);
                        if (!mentionPhone)
                            return null;
                        const member = await MemberRepository.getByPhone(groupId, mentionPhone);
                        return {
                            jid,
                            phone: mentionPhone,
                            displayName: member?.displayName || mentionPhone,
                            role: member?.role || 'unknown'
                        };
                    });
                    const results = await Promise.all(mentionPromises);
                    mentions = results.filter(Boolean);
                }
                catch (error) {
                    logger.warn(`Error resolving mentions for message:`, error);
                }
            }
            if (mentions.length === 0 && text.includes('@')) {
                try {
                    const matches = text.match(/@(\d+)/g);
                    if (matches && matches.length > 0) {
                        logger.info(`🔍 Regex found potential mentions: ${matches.join(', ')}`);
                        const mentionPromises = matches.map(async (match) => {
                            const rawPhone = match.substring(1);
                            const mentionPhone = normalizePhone(rawPhone);
                            if (!mentionPhone)
                                return null;
                            const member = await MemberRepository.getByPhone(groupId, mentionPhone);
                            if (!member) {
                                return {
                                    jid: `${mentionPhone}@s.whatsapp.net`,
                                    phone: mentionPhone,
                                    displayName: mentionPhone,
                                    role: 'unknown'
                                };
                            }
                            return {
                                jid: `${mentionPhone}@s.whatsapp.net`,
                                phone: mentionPhone,
                                displayName: member.displayName || mentionPhone,
                                role: member.role || 'unknown'
                            };
                        });
                        const results = await Promise.all(mentionPromises);
                        mentions = results.filter(Boolean);
                        mentions = [...new Map(mentions.map(m => [m.phone, m])).values()];
                    }
                }
                catch (error) {
                    logger.warn(`Error parsing regex mentions:`, error);
                }
            }
            const messageType = msg.type || 'chat';
            const hasMedia = msg.hasMedia || false;
            const isForwarded = msg.isForwarded || false;
            const mentionedNumbers = mentions.map(m => m.phone);
            const messageData = {
                messageId: msg.id?.id || msg.id?._serialized || `${Date.now()}_${phone}`,
                authorPhone: phone,
                authorName: displayName,
                authorRole: 'member',
                body: text,
                type: messageType,
                hasMedia,
                isForwarded,
                mentionedNumbers,
                timestamp: getNow(),
                wasDeleted: false,
                deletionReason: null,
                triggeredWarn: false,
                contributedToPoints: !isCommand
            };
            await MessageRepository.save(groupId, messageData);
            if (!isCommand) {
                logger.info(`💾 Mensaje guardado en ${groupId}: ${phone} dijo "${text.substring(0, 20)}..." (Mentions: ${mentions.length})`);
            }
            await MemberRepository.update(groupId, phone, {
                lastMessageAt: getNow(),
                displayName: displayName,
                messageCount: FieldValue.increment(1)
            });
            return messageData;
        }
        catch (error) {
            logger.error(`Error al guardar mensaje:`, error);
            throw error;
        }
    }
    static async savePrivateMessage(phone, msg, isCommand = false) {
        try {
            const normalized = normalizePhone(phone);
            const text = msg.body || '';
            const displayName = msg.pushName || normalized;
            const db = getFirestore();
            const messageRef = db.collection('private_messages').doc();
            await messageRef.set({
                phone: normalized,
                displayName,
                text,
                length: text.length,
                isCommand,
                processed: false,
                timestamp: getNow(),
                createdAt: getNow()
            });
            return { id: messageRef.id, phone: normalized, text, isCommand };
        }
        catch (error) {
            logger.error(`Error al guardar mensaje privado:`, error);
            throw error;
        }
    }
}
export default MessageService;
