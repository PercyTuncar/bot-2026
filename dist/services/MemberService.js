import MemberRepository from '../repositories/MemberRepository.js';
import UserRepository from '../repositories/UserRepository.js';
import { getNow } from '../utils/time.js';
import { normalizePhone, normalizeGroupId } from '../utils/phone.js';
import logger from '../lib/logger.js';
import { resolveLidToPhone } from '../utils/lid-resolver.js';
export class MemberService {
    static async getOrCreateUnified(groupId, userId, sock = null, messageMetadata = null) {
        const startTime = Date.now();
        const isLid = userId.includes('@lid');
        const phone = isLid ? null : userId;
        const lid = isLid ? userId : null;
        const existing = await MemberRepository.findByPhoneOrLid(groupId, phone, lid);
        if (existing) {
            logger.info(`✅ Member found: ${existing.docId} (found by ${existing.foundBy})`);
            if (existing.foundBy === 'phone' && lid && !existing.data.lid) {
                logger.info(`🔄 Updating member ${existing.docId} with LID: ${lid}`);
                await MemberRepository.update(groupId, existing.docId, { lid });
                existing.data.lid = lid;
            }
            return existing.data;
        }
        logger.info(`➕ Creating new member with userId: ${userId}`);
        let finalPhone = phone;
        if (!finalPhone && lid) {
            finalPhone = lid.split('@')[0].replace(/[^\d]/g, '');
            logger.info(`📞 Extracted phone from LID: ${finalPhone}`);
        }
        if (!finalPhone || finalPhone.length < 5) {
            logger.error(`❌ Cannot create member: invalid phone extracted from userId=${userId}`);
            throw new Error(`Invalid phone extracted: ${finalPhone}`);
        }
        let contact = null;
        if (sock) {
            try {
                const jid = lid || (finalPhone + '@c.us');
                contact = await sock.getContactById(jid);
                logger.debug(`📞 Contact fetched for ${finalPhone}`);
            }
            catch (err) {
                logger.debug(`Could not fetch contact for ${finalPhone}:`, err.message);
            }
        }
        const participant = {
            id: lid || (finalPhone + '@c.us'),
            notify: messageMetadata?.authorName || contact?.pushname || finalPhone,
            isAdmin: false,
            isSuperAdmin: false
        };
        const memberData = await this.extractCompleteMemberMetadata(participant, contact, finalPhone, groupId);
        if (lid) {
            memberData.lid = lid;
        }
        const saved = await MemberRepository.save(groupId, memberData);
        const duration = Date.now() - startTime;
        logger.info(`[🆕 NEW MEMBER] ${finalPhone} created in ${groupId} (lid=${lid || 'null'}) (${duration}ms)`);
        return saved;
    }
    static async syncGroupMembers(chat, sock) {
        const startTime = Date.now();
        const groupId = normalizeGroupId(chat.id._serialized);
        try {
            logger.info(`[${new Date().toISOString()}] [BATCH WRITE] Syncing ${chat.participants.length} members for group ${groupId}`);
            const memberPromises = chat.participants.map(async (participant) => {
                const phone = normalizePhone(participant.id._serialized);
                if (!phone) {
                    return null;
                }
                if (phone === groupId) {
                    return null;
                }
                try {
                    let contact = null;
                    try {
                        contact = await sock.getContactById(participant.id._serialized);
                    }
                    catch (err) {
                        logger.warn(`Could not fetch contact for ${phone}`, err);
                    }
                    const memberData = await this.extractCompleteMemberMetadata(participant, contact, phone, groupId);
                    await MemberRepository.save(groupId, memberData);
                    logger.debug(`[WRITE] groups/${groupId}/members/${phone} → SUCCESS`);
                    return memberData;
                }
                catch (error) {
                    logger.error(`Error syncing member ${phone}:`, error);
                    return null;
                }
            });
            const members = (await Promise.all(memberPromises)).filter(Boolean);
            const duration = Date.now() - startTime;
            logger.info(`[${new Date().toISOString()}] [BATCH WRITE] ${members.length} members synced (${duration}ms)`);
            return members;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`[${new Date().toISOString()}] [ERROR] Failed to sync members (${duration}ms)`, error);
            throw error;
        }
    }
    static async extractCompleteMemberMetadata(participant, contact, phone, groupId) {
        const now = getNow();
        const found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);
        const existing = found ? found.data : null;
        const memberData = {
            id: `${phone}@c.us`,
            phone: phone,
            lid: existing?.lid || null,
            displayName: contact?.name || participant.notify || phone,
            name: contact?.name || participant.notify || phone,
            pushname: contact?.pushname || participant.notify || phone,
            shortName: contact?.shortName || null,
            number: contact?.number || phone.replace(/^\d+/, ''),
            isMe: contact?.isMe || false,
            isUser: contact?.isUser || true,
            isGroup: contact?.isGroup || false,
            isWAContact: contact?.isWAContact || false,
            isMyContact: contact?.isMyContact || false,
            isBlocked: contact?.isBlocked || false,
            profilePicUrl: null,
            statusMute: contact?.statusMute || false,
            isMember: true,
            isAdmin: participant.isAdmin || false,
            isSuperAdmin: participant.isSuperAdmin || false,
            role: (participant.isSuperAdmin ? 'superadmin' : (participant.isAdmin ? 'admin' : 'member')),
            createdAt: existing?.createdAt || now,
            joinedAt: existing?.joinedAt || now,
            leftAt: null,
            lastMessageAt: existing?.lastMessageAt || null,
            lastSeenAt: now,
            updatedAt: now,
            points: existing?.points || 0,
            lifetimePoints: existing?.lifetimePoints || existing?.points || 0,
            messageCount: existing?.messageCount || 0,
            totalMessagesCount: existing?.totalMessagesCount || 0,
            currentLevel: existing?.currentLevel || 1,
            messagesForNextPoint: existing?.messagesForNextPoint || 0,
            premiumCommands: existing?.premiumCommands || [],
            warnings: existing?.warnings || 0,
            warnHistory: existing?.warnHistory || [],
            stats: {
                totalPointsEarned: existing?.stats?.totalPointsEarned || 0,
                totalPointsSpent: existing?.stats?.totalPointsSpent || 0,
                totalPointsSpentOnCommands: existing?.stats?.totalPointsSpentOnCommands || 0,
                totalPointsSpentOnRewards: existing?.stats?.totalPointsSpentOnRewards || 0,
                totalPremiumCommandsPurchased: existing?.stats?.totalPremiumCommandsPurchased || 0,
                totalRewardsRedeemed: existing?.stats?.totalRewardsRedeemed || 0,
                totalCommandsExecuted: existing?.stats?.totalCommandsExecuted || 0,
                totalPremiumCommandsUsed: existing?.stats?.totalPremiumCommandsUsed || 0,
                firstMessageDate: existing?.stats?.firstMessageDate || now,
                lastActiveDate: now,
                averageMessagesPerDay: existing?.stats?.averageMessagesPerDay || 0,
                longestStreak: existing?.stats?.longestStreak || 0,
                currentStreak: existing?.stats?.currentStreak || 0
            },
            preferences: existing?.preferences || {
                language: 'es',
                notificationsEnabled: true,
                levelUpNotifications: true
            }
        };
        return memberData;
    }
    static async addMember(groupId, phone, displayName) {
        const normalized = normalizePhone(phone);
        let found = await MemberRepository.findByPhoneOrLid(groupId, normalized, normalized);
        let member = found ? found.data : null;
        if (member) {
            await MemberRepository.update(groupId, normalized, {
                isMember: true,
                displayName: displayName || member.displayName,
                joinedAt: getNow()
            });
            found = await MemberRepository.findByPhoneOrLid(groupId, normalized, normalized);
            member = found ? found.data : null;
        }
        else {
            const now = getNow();
            member = await MemberRepository.save(groupId, {
                phone: normalized,
                displayName: displayName || normalized,
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
        await UserRepository.save({
            phone: normalized,
            lastKnownName: displayName || normalized
        });
        await UserRepository.addGroup(normalized, groupId);
        return member;
    }
    static async removeMember(groupId, phone) {
        const found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);
        if (found && found.docId) {
            await MemberRepository.update(groupId, found.docId, {
                isMember: false,
                leftAt: getNow()
            });
            logger.info(`[MemberService] Member ${phone} marked as left (docId: ${found.docId})`);
        }
        else {
            const normalized = normalizePhone(phone);
            if (normalized) {
                await MemberRepository.update(groupId, normalized, {
                    isMember: false,
                    leftAt: getNow()
                });
                logger.info(`[MemberService] Member ${phone} marked as left (normalized: ${normalized})`);
            }
            else {
                logger.warn(`[MemberService] Cannot remove member: no valid docId for ${phone}`);
            }
        }
    }
    static async getMemberInfo(groupId, phone) {
        const found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);
        return found ? found.data : null;
    }
    static async updateMemberName(groupId, phone, displayName) {
        const found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);
        if (found && found.docId) {
            await MemberRepository.update(groupId, found.docId, { displayName });
        }
        else {
            const normalized = normalizePhone(phone);
            if (normalized) {
                await MemberRepository.update(groupId, normalized, { displayName });
            }
            else {
                logger.warn(`[MemberService] Cannot update member name: no valid docId for ${phone}`);
            }
        }
    }
    static async extractUserProfileName(client, userId, groupId) {
        try {
            let targetId = userId;
            if (userId.includes('@lid')) {
                logger.debug(`[MemberService] Intentando resolver LID ${userId} para extraer nombre...`);
                if (groupId) {
                    const resolvedPhone = await resolveLidToPhone(client, groupId, userId);
                    if (resolvedPhone) {
                        targetId = resolvedPhone.includes('@') ? resolvedPhone : `${resolvedPhone}@c.us`;
                        logger.info(`✅ LID ${userId} resuelto a ${targetId} para extracción de nombre`);
                    }
                }
            }
            if (!targetId.includes('@c.us') && !targetId.includes('@lid') && !targetId.includes('@s.whatsapp.net')) {
                if (/^\d+$/.test(targetId)) {
                    targetId = `${targetId}@c.us`;
                }
                else {
                    return null;
                }
            }
            let contact;
            try {
                contact = await client.getContactById(targetId);
            }
            catch (contactError) {
                if (!contactError.message.includes('getIsMyContact')) {
                    logger.warn(`[MemberService] getContactById falló para ${targetId}: ${contactError.message}`);
                }
                return null;
            }
            const isValidName = (name) => {
                if (!name || typeof name !== 'string')
                    return false;
                const trimmed = name.trim();
                if (!trimmed)
                    return false;
                if (trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null')
                    return false;
                return /[a-zA-ZáéíóúñÁÉÍÓÚÑàèìòùÀÈÌÒÙäëïöüÄËÏÖÜ]/.test(trimmed);
            };
            if (isValidName(contact.pushname)) {
                return contact.pushname;
            }
            if (contact.isBusiness && isValidName(contact.verifiedName)) {
                return contact.verifiedName;
            }
            logger.info(`[MemberService] Hidratando datos para ${targetId}...`);
            try {
                const chat = await contact.getChat().catch(e => {
                    if (!e.message.includes('getIsMyContact')) {
                        logger.debug(`[MemberService] getChat falló (esperado para nuevos usuarios): ${e.message}`);
                    }
                    return null;
                });
                if (chat) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                    const refreshedContact = await client.getContactById(targetId);
                    if (isValidName(refreshedContact.pushname)) {
                        return refreshedContact.pushname;
                    }
                    if (refreshedContact.isBusiness && isValidName(refreshedContact.verifiedName)) {
                        return refreshedContact.verifiedName;
                    }
                }
                else {
                    logger.debug(`[MemberService] No se pudo obtener chat para hidratación de ${targetId}`);
                }
            }
            catch (hydrationError) {
                logger.warn(`[MemberService] Fallo en hidratación para ${targetId}: ${hydrationError.message}`);
            }
            if (isValidName(contact.name)) {
                return contact.name;
            }
            if (isValidName(contact.shortName)) {
                return contact.shortName;
            }
            if (!isValidName(contact?.pushname) && userId.includes('@lid') && groupId) {
                logger.info(`[MemberService] Fallback LID: Intentando resolver ${userId} a teléfono real...`);
                const resolvedPhone = await resolveLidToPhone(client, groupId, userId);
                if (resolvedPhone) {
                    const phoneId = resolvedPhone.includes('@') ? resolvedPhone : `${resolvedPhone}@c.us`;
                    logger.info(`[MemberService] LID resuelto: ${userId} -> ${phoneId}. Reintentando extracción...`);
                    return this.extractUserProfileName(client, phoneId);
                }
            }
            try {
                const page = client.pupPage;
                if (page) {
                    logger.info(`[MemberService] Intentando extracción directa vía Puppeteer para ${targetId}...`);
                    const puppetName = await page.evaluate(async (id) => {
                        try {
                            const store = window.Store;
                            if (!store || !store.Contact)
                                return null;
                            const contactModel = store.Contact.get(id);
                            if (contactModel) {
                                return contactModel.pushname || contactModel.name || contactModel.verifiedName || contactModel.notifyName;
                            }
                        }
                        catch (e) {
                            return null;
                        }
                        return null;
                    }, targetId);
                    if (isValidName(puppetName)) {
                        logger.info(`✅ Nombre extraído vía Puppeteer: "${puppetName}"`);
                        return puppetName;
                    }
                }
            }
            catch (pupError) {
                logger.debug(`[MemberService] Puppeteer extraction failed: ${pupError.message}`);
            }
            logger.warn(`[MemberService] No se pudo extraer pushname válido para ${targetId}.`);
            return null;
        }
        catch (error) {
            logger.error(`[MemberService] Fallo en extracción de nombre: ${error.message}`);
            return null;
        }
    }
}
export default MemberService;
