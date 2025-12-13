import MemberRepository from '../repositories/MemberRepository.js';
import GroupRepository from '../repositories/GroupRepository.js';
import { MemberService } from './MemberService.js';
import { getFirestore } from '../config/firebase.js';
import { getNow } from '../utils/time.js';
import { normalizeGroupId, getUserId, getDisplayNameFromMessage } from '../utils/phone.js';
import logger from '../lib/logger.js';
export class MessageService {
    static async saveMessage(groupId, msg, isCommand = false, userPhone = null, sock = null) {
        const startTime = Date.now();
        groupId = normalizeGroupId(groupId);
        try {
            const group = await GroupRepository.getById(groupId);
            if (!group || !group.isActive) {
                logger.debug(`Message not saved - group ${groupId} is inactive`);
                return { saved: false, reason: 'group_inactive' };
            }
            const messageData = await this.extractCompleteMessageMetadata(msg, groupId, isCommand, userPhone, sock);
            if (!messageData) {
                return { saved: false, reason: 'invalid_message' };
            }
            const db = getFirestore();
            await db.collection('groups')
                .doc(groupId)
                .collection('messages')
                .doc(messageData.messageId)
                .set(messageData);
            if (messageData.authorPhone) {
                try {
                    await MemberRepository.updateActivity(groupId, messageData.authorPhone);
                }
                catch (err) {
                    logger.warn(`Failed to update activity for ${messageData.authorPhone}`, err);
                }
            }
            const duration = Date.now() - startTime;
            logger.debug(`[${new Date().toISOString()}] [CREATE] groups/${groupId}/messages/${messageData.messageId} → SUCCESS (${duration}ms)`);
            return { saved: true, messageData };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`[${new Date().toISOString()}] [ERROR] Failed to save message in ${groupId} (${duration}ms)`, error);
            return { saved: false, reason: 'error', error };
        }
    }
    static async extractCompleteMessageMetadata(msg, groupId, isCommand, userPhone = null, sock = null) {
        const remoteJid = msg.to || msg.from;
        const isGroup = remoteJid?.endsWith('@g.us');
        let authorPhone = userPhone || getUserId(msg, isGroup);
        if (!authorPhone) {
            logger.warn(`Invalid author phone: empty (userPhone=${userPhone}, msg.author=${msg.author})`);
            return null;
        }
        if (authorPhone.includes(':')) {
            authorPhone = authorPhone.split(':')[0];
        }
        const authorName = getDisplayNameFromMessage(msg, authorPhone);
        const isLid = authorPhone.includes('@lid');
        const phoneForSearch = isLid ? null : authorPhone;
        const lidForSearch = isLid ? authorPhone : null;
        let authorDocId = authorPhone;
        let authorRole = 'member';
        try {
            const messageMetadata = {
                authorName: authorName,
                timestamp: getNow()
            };
            if (!isCommand) {
                const member = await MemberService.getOrCreateUnified(groupId, isLid ? lidForSearch : phoneForSearch, sock, messageMetadata);
                if (member) {
                    authorDocId = member.phone;
                    if (member.isSuperAdmin)
                        authorRole = 'superadmin';
                    else if (member.isAdmin)
                        authorRole = 'admin';
                    logger.debug(`✅ Member ${authorDocId} found/created with role: ${authorRole}`);
                }
            }
        }
        catch (error) {
            logger.warn(`Could not fetch/create member for ${authorPhone}`, error);
            if (isLid) {
                authorDocId = authorPhone.split('@')[0].replace(/[^\d]/g, '');
            }
        }
        const body = msg.body || '';
        let type = 'chat';
        if (msg.type) {
            type = msg.type;
        }
        else if (msg.hasMedia) {
            type = 'media';
        }
        const links = this.extractLinks(body);
        const mentionedIds = msg.mentionedIds || [];
        const messageData = {
            messageId: msg.id?.id || msg.id?._serialized || `${Date.now()}_${authorPhone}`,
            authorPhone: authorDocId,
            authorLid: authorPhone.includes('@lid') ? authorPhone : null,
            authorName,
            authorRole,
            body,
            type,
            hasMedia: msg.hasMedia || false,
            isForwarded: msg.isForwarded || false,
            isStarred: msg.isStarred || false,
            fromMe: msg.fromMe || false,
            hasQuotedMsg: msg.hasQuotedMsg || false,
            quotedMsgId: msg._data?.quotedMsg?.id || null,
            mentionedIds,
            mentionedCount: mentionedIds.length,
            links,
            hasLinks: links.length > 0,
            timestamp: msg.timestamp ? new Date(msg.timestamp * 1000) : getNow(),
            wasDeleted: false,
            deletionReason: null,
            deletedBy: null,
            triggeredWarn: false,
            isCommand,
            commandName: isCommand ? this.extractCommandName(body) : null,
            commandSuccess: null,
            contributedToPoints: !isCommand
        };
        return messageData;
    }
    static extractLinks(text) {
        if (!text)
            return [];
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const matches = text.match(urlRegex);
        return matches || [];
    }
    static extractCommandName(text) {
        if (!text)
            return null;
        const match = text.match(/^[.!\/](\w+)/);
        return match ? match[1].toLowerCase() : null;
    }
    static async markAsDeleted(groupId, messageId, reason, deletedBy = 'BOT') {
        const startTime = Date.now();
        groupId = normalizeGroupId(groupId);
        try {
            const db = getFirestore();
            await db.collection('groups')
                .doc(groupId)
                .collection('messages')
                .doc(messageId)
                .update({
                wasDeleted: true,
                deletionReason: reason,
                deletedBy,
                deletedAt: getNow()
            });
            const duration = Date.now() - startTime;
            logger.debug(`[${new Date().toISOString()}] [UPDATE] groups/${groupId}/messages/${messageId} marked as deleted → SUCCESS (${duration}ms)`);
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`[${new Date().toISOString()}] [ERROR] Failed to mark message as deleted (${duration}ms)`, error);
        }
    }
    static async updateCommandResult(groupId, messageId, success) {
        const startTime = Date.now();
        groupId = normalizeGroupId(groupId);
        try {
            const db = getFirestore();
            await db.collection('groups')
                .doc(groupId)
                .collection('messages')
                .doc(messageId)
                .update({
                commandSuccess: success
            });
            const duration = Date.now() - startTime;
            logger.debug(`[${new Date().toISOString()}] [UPDATE] groups/${groupId}/messages/${messageId} command result → SUCCESS (${duration}ms)`);
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`[${new Date().toISOString()}] [ERROR] Failed to update command result (${duration}ms)`, error);
        }
    }
    static async savePrivateMessage(userPhone, msg, isCommand = false) {
        const startTime = Date.now();
        try {
            const messageId = msg.id?.id || msg.id?._serialized || `dm_${Date.now()}`;
            const body = msg.body || '';
            logger.debug(`[${new Date().toISOString()}] [DM] from ${userPhone}: ${body.substring(0, 100)} (command: ${isCommand})`);
            const duration = Date.now() - startTime;
            return { saved: true, duration };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`[${new Date().toISOString()}] [ERROR] Failed to save private message (${duration}ms)`, error);
            return { saved: false, error };
        }
    }
}
export default MessageService;
