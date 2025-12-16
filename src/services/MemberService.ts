import MemberRepository from '../repositories/MemberRepository.js';
import UserRepository from '../repositories/UserRepository.js';
import { getFirestore } from '../config/firebase.js';
import { getNow } from '../utils/time.js';
import { normalizePhone, normalizeGroupId } from '../utils/phone.js';
import logger from '../lib/logger.js';
import { MemberData } from '../types/firestore.types.js';

import { resolveLidToPhone } from '../utils/lid-resolver.js';

export class MemberService {
  /**
   * Obtiene o crea un miembro con UNIFICACIÓN DE IDENTIDAD
   * CRITICAL: Evita duplicación al buscar por phone O lid
   * Si encuentra por phone pero no tiene lid, lo actualiza automáticamente
   * 
   * @param {string} groupId - ID del grupo
   * @param {string} userId - Identificador del usuario (puede ser phone o LID)
   * @param {object} sock - Cliente de WhatsApp (opcional, para obtener Contact)
   * @returns {object} - Member unificado
   */
  static async getOrCreateUnified(groupId: string, userId: string, sock: any = null, messageMetadata: any = null): Promise<MemberData> {
    const startTime = Date.now();

    // Determinar si userId es LID o phone
    const isLid = userId.includes('@lid');
    const phone = isLid ? null : userId;
    const lid = isLid ? userId : null;

    // Buscar miembro existente por phone O lid
    const existing = await MemberRepository.findByPhoneOrLid(groupId, phone, lid);

    if (existing) {
      logger.info(`✅ Member found: ${existing.docId} (found by ${existing.foundBy})`);

      // Si encontramos por phone pero ahora tenemos un LID, ACTUALIZAR
      if (existing.foundBy === 'phone' && lid && !existing.data.lid) {
        logger.info(`🔄 Updating member ${existing.docId} with LID: ${lid}`);
        await MemberRepository.update(groupId, existing.docId, { lid });
        existing.data.lid = lid;
      }

      return existing.data;
    }

    // No existe: crear nuevo miembro con TODA la información
    logger.info(`➕ Creating new member with userId: ${userId}`);

    // Extraer phone real (será el docId único)
    let finalPhone = phone;

    // Si tenemos LID pero no phone, intentar resolverlo (Último recurso)
    if (!finalPhone && lid) {
      // INTENTO DE RESOLUCIÓN FINAL
      if (sock && (sock as any).signalRepository?.lidMapping) {
        try {
          const lidMap = (sock as any).signalRepository.lidMapping;
          const pnJid = await lidMap.getPNForLID(lid);
          if (pnJid) {
            finalPhone = pnJid.split('@')[0].split(':')[0];
            logger.info(`🔄 [MemberService] Final LID resolution: ${lid} -> ${finalPhone}`);
          }
        } catch (e) { }
      }

      // Si aún no hay phone, usamos el LID como fallback (sin asumir que es teléfono)
      if (!finalPhone) {
        finalPhone = lid.split('@')[0];
        logger.warn(`⚠️ Created member with LID as phone (Resolution failed): ${finalPhone}`);
      }
    }

    // Validar que tenemos un phone válido
    if (!finalPhone || finalPhone.length < 5) {
      logger.error(`❌ Cannot create member: invalid phone extracted from userId=${userId}`);
      throw new Error(`Invalid phone extracted: ${finalPhone}`);
    }

    // Intentar obtener Contact de WhatsApp para metadatos completos
    // Note: En Baileys no existe getContactById, usamos datos del mensaje
    let contact = null;
    // Contact info is extracted from message pushName or groupMetadata

    // Crear participant object simulado si tenemos messageMetadata
    const participant = {
      id: lid || (finalPhone + '@c.us'),
      notify: messageMetadata?.authorName || contact?.pushname || finalPhone,
      isAdmin: false,
      isSuperAdmin: false
    };

    // Usar extractCompleteMemberMetadata para obtener estructura COMPLETA
    const memberData = await this.extractCompleteMemberMetadata(
      participant,
      contact,
      finalPhone,
      groupId
    );

    // Agregar el LID si existe
    if (lid) {
      memberData.lid = lid;
    }

    // Guardar en Firestore con phone como docId (único identificador)
    const saved = await MemberRepository.save(groupId, memberData);

    const duration = Date.now() - startTime;
    logger.info(`[🆕 NEW MEMBER] ${finalPhone} created in ${groupId} (lid=${lid || 'null'}) (${duration}ms)`);

    return saved;
  }

  /**
   * Sincroniza miembros del grupo con whatsapp-web.js
   * SPEC: Section 3.2 - Extracción COMPLETA de metadatos de Contact
   */
  static async syncGroupMembers(chat: any, sock: any): Promise<MemberData[]> {
    const startTime = Date.now();
    const groupId = normalizeGroupId(chat.id._serialized);

    try {
      logger.info(`[${new Date().toISOString()}] [BATCH WRITE] Syncing ${chat.participants.length} members for group ${groupId}`);

      const memberPromises = chat.participants.map(async (participant: any) => {
        const phone = normalizePhone(participant.id._serialized);

        // normalizePhone retorna '' para LIDs, solo valida si phone está vacío
        if (!phone) {
          return null;
        }

        // Validar que phone no sea igual a groupId
        if (phone === groupId) {
          return null;
        }

        try {
          // En Baileys, usamos datos del participant directamente
          const contact = null; // Contact info extracted from participant

          const memberData = await this.extractCompleteMemberMetadata(
            participant,
            contact,
            phone,
            groupId
          );

          await MemberRepository.save(groupId, memberData);
          logger.debug(`[WRITE] groups/${groupId}/members/${phone} → SUCCESS`);

          return memberData;
        } catch (error) {
          logger.error(`Error syncing member ${phone}:`, error);
          return null;
        }
      });

      const members = (await Promise.all(memberPromises)).filter(Boolean);

      const duration = Date.now() - startTime;
      logger.info(`[${new Date().toISOString()}] [BATCH WRITE] ${members.length} members synced (${duration}ms)`);

      return members;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[${new Date().toISOString()}] [ERROR] Failed to sync members (${duration}ms)`, error);
      throw error;
    }
  }

  /**
   * Extrae TODOS los metadatos disponibles de un Contact y GroupParticipant
   * SPEC: Section 3.2 - Estructura completa del documento member
   */
  static async extractCompleteMemberMetadata(participant: any, contact: any, phone: string, groupId: string): Promise<MemberData> {
    const now = getNow();

    // Obtener miembro existente para preservar datos
    const found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);
    const existing = found ? found.data : null;

    // ============ IDENTIFICACIÓN (de Contact) ============
    const memberData = {
      id: `${phone}@c.us`, // SPEC: ID debe tener siempre @c.us
      phone: phone,
      lid: existing?.lid || null, // LID si existe (se actualiza desde getOrCreateUnified)

      // ============ INFORMACIÓN DEL CONTACTO (de Contact) ============
      displayName: contact?.name || participant.notify || phone,
      name: contact?.name || participant.notify || phone,
      pushname: contact?.pushname || participant.notify || phone,
      shortName: contact?.shortName || null,
      number: contact?.number || phone.replace(/^\d+/, ''), // Sin código de país

      // ============ ESTADO DEL CONTACTO (de Contact) ============
      isMe: contact?.isMe || false,
      isUser: contact?.isUser || true,
      isGroup: contact?.isGroup || false,
      isWAContact: contact?.isWAContact || false,
      isMyContact: contact?.isMyContact || false,
      isBlocked: contact?.isBlocked || false,

      // ============ PERFIL (de Contact) ============
      profilePicUrl: null, // Se puede obtener con getProfilePicUrl()
      statusMute: contact?.statusMute || false,

      // ============ ESTADO EN EL GRUPO (de GroupParticipant) ============
      isMember: true,
      isAdmin: participant.isAdmin || false,
      isSuperAdmin: participant.isSuperAdmin || false,
      role: (participant.isSuperAdmin ? 'superadmin' : (participant.isAdmin ? 'admin' : 'member')) as 'member' | 'admin' | 'superadmin',

      // ============ TIMESTAMPS ============
      createdAt: existing?.createdAt || now,
      joinedAt: existing?.joinedAt || now,
      leftAt: null,
      lastMessageAt: existing?.lastMessageAt || null,
      lastSeenAt: now,
      updatedAt: now,

      // ============ SISTEMA DE PUNTOS ============
      points: existing?.points || 0,
      lifetimePoints: existing?.lifetimePoints || existing?.points || 0,
      messageCount: existing?.messageCount || 0,
      totalMessagesCount: existing?.totalMessagesCount || 0,
      currentLevel: existing?.currentLevel || 1,
      messagesForNextPoint: existing?.messagesForNextPoint || 0,

      // ============ COMANDOS PREMIUM COMPRADOS (NUEVO) ============
      premiumCommands: existing?.premiumCommands || [],

      // ============ SISTEMA DE MODERACIÓN ============
      warnings: existing?.warnings || 0,
      warnHistory: existing?.warnHistory || [],

      // ============ ESTADÍSTICAS ============
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

      // ============ PREFERENCIAS ============
      preferences: existing?.preferences || {
        language: 'es',
        notificationsEnabled: true,
        levelUpNotifications: true
      }
    };

    return memberData;
  }

  /**
   * Agrega un miembro a un grupo
   */
  static async addMember(groupId: string, phone: string, displayName: string): Promise<MemberData> {
    const normalized = normalizePhone(phone);

    // Verificar si ya existe
    let found = await MemberRepository.findByPhoneOrLid(groupId, normalized, normalized);
    let member = found ? found.data : null;

    if (member) {
      // Reactivar miembro
      await MemberRepository.update(groupId, normalized, {
        isMember: true,
        displayName: displayName || member.displayName,
        joinedAt: getNow()
      });
      found = await MemberRepository.findByPhoneOrLid(groupId, normalized, normalized);
      member = found ? found.data : null;
    } else {
      // Crear nuevo miembro con esquema completo (SPEC Section 3.2)
      const now = getNow();
      member = await MemberRepository.save(groupId, {
        phone: normalized,
        displayName: displayName || normalized,
        isMember: true,
        role: 'member',
        // Sistema de puntos
        points: 0,
        messageCount: 0,
        totalMessagesCount: 0,
        currentLevel: 1,
        messagesForNextPoint: 0,
        // Sistema de moderación
        warnings: 0,
        warnHistory: [],
        // Historial temporal
        createdAt: now,
        joinedAt: now,
        leftAt: null,
        lastMessageAt: null,
        updatedAt: now,
        // Estadísticas
        stats: {
          totalPointsEarned: 0,
          totalPointsSpent: 0,
          totalRewardsRedeemed: 0,
          firstMessageDate: now,
          averageMessagesPerDay: 0
        }
      });
    }

    // Actualizar usuario global
    await UserRepository.save({
      phone: normalized,
      lastKnownName: displayName || normalized
    });
    await UserRepository.addGroup(normalized, groupId);

    return member;
  }

  /**
   * Marca un miembro como salido
   * Soporta tanto phone numbers como LIDs
   */
  static async removeMember(groupId: string, phone: string): Promise<void> {
    // Primero intentar encontrar el documento por phone o LID
    const found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);

    if (found && found.docId) {
      // Usar el docId del documento encontrado
      await MemberRepository.update(groupId, found.docId, {
        isMember: false,
        leftAt: getNow()
      });
      logger.info(`[MemberService] Member ${phone} marked as left (docId: ${found.docId})`);
    } else {
      // Fallback: intentar con normalizePhone si no es LID
      const normalized = normalizePhone(phone);
      if (normalized) {
        await MemberRepository.update(groupId, normalized, {
          isMember: false,
          leftAt: getNow()
        });
        logger.info(`[MemberService] Member ${phone} marked as left (normalized: ${normalized})`);
      } else {
        logger.warn(`[MemberService] Cannot remove member: no valid docId for ${phone}`);
      }
    }
  }

  /**
   * Obtiene información de un miembro
   */
  static async getMemberInfo(groupId: string, phone: string): Promise<MemberData | null> {
    const found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);
    return found ? found.data : null;
  }

  /**
   * Actualiza el nombre de un miembro
   * Soporta tanto phone numbers como LIDs
   */
  static async updateMemberName(groupId: string, phone: string, displayName: string): Promise<void> {
    // Primero intentar encontrar el documento por phone o LID
    const found = await MemberRepository.findByPhoneOrLid(groupId, phone, phone);

    if (found && found.docId) {
      await MemberRepository.update(groupId, found.docId, { displayName });
    } else {
      const normalized = normalizePhone(phone);
      if (normalized) {
        await MemberRepository.update(groupId, normalized, { displayName });
      } else {
        logger.warn(`[MemberService] Cannot update member name: no valid docId for ${phone}`);
      }
    }
  }

  /**
   * Extrae el nombre de perfil público (Pushname) de un usuario.
   * Maneja casos de cuentas Business y datos undefined mediante hidratación forzada.
   * Resuelve LIDs a números de teléfono si es necesario.
   * @param {any} client - Cliente de WhatsApp
   * @param {string} userId - ID del usuario (ej. '12345@c.us' o LID)
   * @param {string} groupId - (Opcional) ID del grupo para resolución de LIDs
   * @returns {Promise<string|null>} - El nombre o null si no se puede obtener.
   */
  static async extractUserProfileName(client: any, userId: string, groupId?: string): Promise<string | null> {
    try {
      // 0. Resolución de LID a Phone si es necesario
      let targetId = userId;
      if (userId.includes('@lid')) {
        logger.debug(`[MemberService] Intentando resolver LID ${userId} para extraer nombre...`);

        // Intentar resolver usando el grupo si está disponible
        if (groupId) {
          const resolvedPhone = await resolveLidToPhone(client, groupId, userId);
          if (resolvedPhone) {
            targetId = resolvedPhone.includes('@') ? resolvedPhone : `${resolvedPhone}@c.us`;
            logger.info(`✅ LID ${userId} resuelto a ${targetId} para extracción de nombre`);
          }
        }
      }

      // Validación básica del formato del ID
      if (!targetId.includes('@c.us') && !targetId.includes('@lid') && !targetId.includes('@s.whatsapp.net')) {
        // Intentar normalizar si es solo números
        if (/^\d+$/.test(targetId)) {
          targetId = `${targetId}@c.us`;
        } else {
          // Si no es un formato válido conocido, retornar null
          return null;
        }
      }

      // 1. Intentar obtener contacto
      let contact;
      try {
        contact = await client.getContactById(targetId);
      } catch (contactError: any) {
        // Ignorar el error de TypeError: window.Store.ContactMethods.getIsMyContact is not a function
        // Esto sucede porque whatsapp-web.js intenta llamar a una función obsoleta internamente
        if (!contactError.message.includes('getIsMyContact')) {
          logger.warn(`[MemberService] getContactById falló para ${targetId}: ${contactError.message}`);
        }

        // Si falló y era un LID, no podemos hacer mucho más sin el groupId para resolverlo
        return null;
      }

      // Helper para validar nombres
      const isValidName = (name: any): boolean => {
        if (!name || typeof name !== 'string') return false;
        const trimmed = name.trim();
        if (!trimmed) return false;
        if (trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null') return false;
        // Debe contener al menos una letra
        return /[a-zA-ZáéíóúñÁÉÍÓÚÑàèìòùÀÈÌÒÙäëïöüÄËÏÖÜ]/.test(trimmed);
      };

      // Caso 1: El dato está disponible inmediatamente
      if (isValidName(contact.pushname)) {
        return contact.pushname;
      }

      // Caso 2: Es una cuenta de negocio verificada
      if (contact.isBusiness && isValidName(contact.verifiedName)) {
        return contact.verifiedName; // Precedencia sobre pushname undefined
      }

      // Caso 3: Intento de hidratación forzada
      logger.info(`[MemberService] Hidratando datos para ${targetId}...`);

      try {
        // Forzamos la obtención del chat asociado para disparar sync
        // CRITICAL FIX: Usar try-catch específico aquí porque getChat puede fallar con LIDs
        const chat = await contact.getChat().catch(e => {
          // Ignorar el error de TypeError: window.Store.ContactMethods.getIsMyContact is not a function
          if (!e.message.includes('getIsMyContact')) {
            logger.debug(`[MemberService] getChat falló (esperado para nuevos usuarios): ${e.message}`);
          }
          return null;
        });

        if (chat) {
          // Pequeña pausa para permitir que el loop de eventos procese datos entrantes
          await new Promise(resolve => setTimeout(resolve, 800)); // Aumentado a 800ms

          // Re-consultamos el contacto tras la interacción interna
          const refreshedContact = await client.getContactById(targetId);

          if (isValidName(refreshedContact.pushname)) {
            return refreshedContact.pushname;
          }

          if (refreshedContact.isBusiness && isValidName(refreshedContact.verifiedName)) {
            return refreshedContact.verifiedName;
          }
        } else {
          logger.debug(`[MemberService] No se pudo obtener chat para hidratación de ${targetId}`);
        }

      } catch (hydrationError) {
        logger.warn(`[MemberService] Fallo en hidratación para ${targetId}: ${hydrationError.message}`);
      }

      // Fallback: name (nombre local)
      if (isValidName(contact.name)) {
        return contact.name;
      }

      // Fallback: shortName
      if (isValidName(contact.shortName)) {
        return contact.shortName;
      }

      // Fallback final: Si seguimos sin nombre y tenemos un LID y groupId, intentar resolver y reintentar
      // Esto es crucial porque getContactById falla para LIDs debido al error interno de whatsapp-web.js
      if (!isValidName(contact?.pushname) && userId.includes('@lid') && groupId) {
        logger.info(`[MemberService] Fallback LID: Intentando resolver ${userId} a teléfono real...`);
        const resolvedPhone = await resolveLidToPhone(client, groupId, userId);
        if (resolvedPhone) {
          const phoneId = resolvedPhone.includes('@') ? resolvedPhone : `${resolvedPhone}@c.us`;
          logger.info(`[MemberService] LID resuelto: ${userId} -> ${phoneId}. Reintentando extracción...`);
          // Llamada recursiva con el ID de teléfono real (evita bucle infinito porque phoneId no tiene @lid)
          return this.extractUserProfileName(client, phoneId);
        }
      }

      // ULTIMO RECURSO: Extracción directa vía Puppeteer (bypassing wwebjs wrappers)
      // Si todo lo anterior falló (incluyendo LIDs), intentamos leer el Store directamente
      try {
        // @ts-ignore
        const page = client.pupPage;
        if (page) {
          logger.info(`[MemberService] Intentando extracción directa vía Puppeteer para ${targetId}...`);

          // Estrategia mejorada: Intentar múltiples fuentes en el Store de WhatsApp
          const puppetName = await page.evaluate(async (id: string) => {
            try {
              // @ts-ignore
              const store = window.Store;
              if (!store) return null;

              // 1. Intentar Contact Store
              if (store.Contact) {
                const contactModel = store.Contact.get(id);
                if (contactModel) {
                  const name = contactModel.pushname || contactModel.name || contactModel.verifiedName || contactModel.notifyName;
                  if (name) return { name, source: 'Contact' };
                }
              }

              // 2. Intentar ProfilePicFind (a veces tiene info de nombres)
              if (store.ProfilePicFind && typeof store.ProfilePicFind.find === 'function') {
                try {
                  const pic = await store.ProfilePicFind.find(id);
                  // A veces el objeto retornado tiene metadata con nombre
                  if (pic && pic.pushname) return { name: pic.pushname, source: 'ProfilePicFind' };
                } catch (e) { }
              }

              // 3. Intentar Chat Store para buscar info
              if (store.Chat) {
                const chat = store.Chat.get(id);
                if (chat) {
                  const name = chat.name || chat.pushname || chat.contact?.pushname;
                  if (name) return { name, source: 'Chat' };
                }
              }

              // 4. Intentar obtener Participant de cualquier grupo (para LIDs)
              // El LID puede estar mapeado en algún grupo
              if (id.includes('@lid') && store.GroupMetadata) {
                for (const [, groupMeta] of store.GroupMetadata._index || []) {
                  if (groupMeta && groupMeta.participants) {
                    const participants = Array.isArray(groupMeta.participants)
                      ? groupMeta.participants
                      : (groupMeta.participants.getModelsArray ? groupMeta.participants.getModelsArray() : []);

                    if (Array.isArray(participants)) {
                      for (const p of participants) {
                        const pId = p.id?._serialized || p.id;
                        if (pId === id) {
                          const name = p.pushname || p.notify || p.name;
                          if (name) return { name, source: 'GroupMetadata' };
                        }
                      }
                    }
                  }
                }
              }

              // 5. Intentar PresenceStore
              if (store.Presence) {
                const presence = store.Presence.get(id);
                if (presence && presence.name) {
                  return { name: presence.name, source: 'Presence' };
                }
              }

            } catch (e) {
              console.error('[Puppeteer] Error en extracción:', e);
              return null;
            }
            return null;
          }, targetId);

          if (puppetName && isValidName(puppetName.name)) {
            logger.info(`✅ Nombre extraído vía Puppeteer (${puppetName.source}): "${puppetName.name}"`);
            return puppetName.name;
          }
        }
      } catch (pupError: any) {
        logger.debug(`[MemberService] Puppeteer extraction failed: ${pupError.message}`);
      }

      logger.warn(`[MemberService] No se pudo extraer pushname válido para ${targetId}.`);
      return null;

    } catch (error) {
      logger.error(`[MemberService] Fallo en extracción de nombre: ${error.message}`);
      return null;
    }
  }
}

export default MemberService;

