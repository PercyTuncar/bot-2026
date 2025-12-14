/**
 * Utilidades para resolver LIDs (Linked IDs) a números reales
 * Los LIDs son identificadores temporales de dispositivos vinculados
 * 
 * NOTA IMPORTANTE (Diciembre 2025):
 * En grupos grandes (+600 miembros), WhatsApp usa "Lazy Loading" - los datos
 * de contacto (nombre, pushname) NO se cargan hasta que el usuario interactúa
 * con el panel de información del grupo. La solución es forzar la sincronización
 * simulando la apertura del panel con Store.Cmd.
 */

import logger from '../lib/logger.js';
import { normalizePhone, normalizeGroupId } from './phone.js';

// Cache de resolución LID → número real (expira cada 5 minutos)
const lidCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Cache de nombres extraídos por LID
const lidNameCache = new Map<string, { name: string; timestamp: number }>();

/**
 * NUEVA FUNCIÓN: Fuerza la carga de datos de un contacto específico
 * Simula la apertura del perfil del usuario para que WhatsApp cargue sus datos
 * ESTA ES LA SOLUCIÓN DEFINITIVA para grupos grandes con Lazy Loading
 * 
 * @param client - Cliente de WhatsApp con pupPage
 * @param participantJid - JID del participante (LID o phone@c.us)
 * @param groupJid - JID del grupo (opcional, mejora la búsqueda)
 * @returns Nombre del usuario si se pudo cargar, null si falló
 */
export async function forceLoadContactData(
  client: any,
  participantJid: string,
  groupJid?: string
): Promise<{ name: string | null; phone: string | null }> {
  if (!client?.pupPage) return { name: null, phone: null };

  try {
    logger.info(`🔍 [FORCE LOAD] Forzando carga de datos para ${participantJid}...`);

    const result = await client.pupPage.evaluate(async (pJid: string, gJid: string | undefined) => {
      try {
        // @ts-ignore
        const store = window.Store;
        if (!store) return { success: false, name: null, phone: null, error: 'Store no disponible' };

        // Helper para validar nombres
        const isValid = (n: any): boolean => {
          if (!n || typeof n !== 'string') return false;
          const t = n.trim();
          return t.length > 0 && t !== 'undefined' && t !== 'null' && t !== 'Unknown';
        };

        // Detectar si es grupo grande
        let isLargeGroup = false;
        let participantCount = 0;
        if (gJid && store.GroupMetadata) {
          try {
            const groupMeta = store.GroupMetadata.get(gJid);
            if (groupMeta && groupMeta.participants) {
              const participants = Array.isArray(groupMeta.participants)
                ? groupMeta.participants
                : (groupMeta.participants.getModelsArray ? groupMeta.participants.getModelsArray() : []);

              if (Array.isArray(participants)) {
                participantCount = participants.length;
                isLargeGroup = participantCount > 100;
              }
            }
          } catch (e) {
            isLargeGroup = true;
          }
        }

        // Tiempos ajustados para grupos grandes
        const waitTimes = {
          openChat: isLargeGroup ? 1500 : 800,
          openProfile: isLargeGroup ? 1000 : 500,
          openGroupInfo: isLargeGroup ? 2500 : 1200,
          queryExist: isLargeGroup ? 1200 : 500,
          finalWait: isLargeGroup ? 1500 : 500
        };

        // ESTRATEGIA 1: Abrir info del grupo (crítico para grupos grandes)
        if (gJid && store.Cmd && store.Chat) {
          try {
            const groupChat = store.Chat.get(gJid);
            if (groupChat) {
              if (store.Cmd.openChatBottom) {
                try {
                  await store.Cmd.openChatBottom(groupChat);
                  await new Promise(r => setTimeout(r, waitTimes.openChat));
                } catch (e) { }
              }

              if (store.Cmd.openDrawerMid) {
                try {
                  await store.Cmd.openDrawerMid(groupChat);
                  await new Promise(r => setTimeout(r, waitTimes.openGroupInfo));

                  if (store.Cmd.closeDrawerRight) {
                    await store.Cmd.closeDrawerRight();
                  }
                } catch (e) { }
              }
            }
          } catch (e) { }
        }

        // ESTRATEGIA 2: Abrir chat 1-a-1
        if (store.Cmd && store.Chat) {
          try {
            let userChat = store.Chat.get(pJid);

            if (!userChat && store.Cmd.openChatBottom) {
              let wid = pJid;
              if (store.Wid && !pJid.includes('@')) {
                try {
                  wid = store.Wid.createUserWid(pJid);
                } catch (e) { }
              }

              try {
                await store.Cmd.openChatBottom(wid);
                await new Promise(r => setTimeout(r, waitTimes.openChat));
                userChat = store.Chat.get(pJid);
              } catch (e) { }
            }

            if (userChat && store.Cmd.openDrawerRight) {
              try {
                await store.Cmd.openDrawerRight();
                await new Promise(r => setTimeout(r, waitTimes.openProfile));

                if (store.Cmd.closeDrawerRight) {
                  await store.Cmd.closeDrawerRight();
                }
              } catch (e) { }
            }
          } catch (cmdErr) { }
        }

        // ESTRATEGIA 3: QueryExist
        if (store.QueryExist) {
          try {
            await store.QueryExist(pJid);
            await new Promise(r => setTimeout(r, waitTimes.queryExist));
          } catch (e) { }
        }

        // Espera final
        await new Promise(r => setTimeout(r, waitTimes.finalWait));

        // EXTRAER DATOS
        let foundName: string | null = null;
        let foundPhone: string | null = null;

        // 1. Contact Store (pushname = perfil, NO usar contact.name)
        if (store.Contact) {
          const contact = store.Contact.get(pJid);
          if (contact) {
            if (isValid(contact.pushname)) foundName = contact.pushname;
            else if (isValid(contact.verifiedName)) foundName = contact.verifiedName;
            else if (isValid(contact.notifyName)) foundName = contact.notifyName;

            foundPhone = contact.number || contact.phoneNumber || null;
          }
        }

        // 2. GroupMetadata
        if (!foundName && gJid && store.GroupMetadata) {
          const groupMeta = store.GroupMetadata.get(gJid);
          if (groupMeta && groupMeta.participants) {
            const participants = Array.isArray(groupMeta.participants)
              ? groupMeta.participants
              : (groupMeta.participants.getModelsArray ? groupMeta.participants.getModelsArray() : []);

            if (Array.isArray(participants)) {
              for (const p of participants) {
                const pid = p.id?._serialized || p.id;
                if (pid === pJid) {
                  if (isValid(p.pushname)) foundName = p.pushname;
                  else if (isValid(p.notify)) foundName = p.notify;
                  if (!foundPhone) foundPhone = p.number || null;
                  break;
                }
              }
            }
          }
        }

        // 3. Chat
        if (!foundName) {
          const chat = store.Chat?.get(pJid);
          if (chat?.contact) {
            if (isValid(chat.contact.pushname)) foundName = chat.contact.pushname;
            else if (isValid(chat.contact.verifiedName)) foundName = chat.contact.verifiedName;
            if (!foundName && isValid(chat.name)) foundName = chat.name;
          }
        }

        return {
          success: !!foundName,
          name: foundName,
          phone: foundPhone,
          participantCount,
          isLargeGroup
        };
      } catch (e: any) {
        return { success: false, name: null, phone: null, error: e.message };
      }
    }, participantJid, groupJid);

    if (result.success && result.name) {
      const groupInfo = result.isLargeGroup ? ` [Grupo grande: ${result.participantCount} miembros]` : '';
      logger.info(`✅ [FORCE LOAD] Datos cargados exitosamente: "${result.name}" (${result.phone || 'no phone'})${groupInfo}`);
      return { name: result.name, phone: result.phone };
    } else {
      logger.warn(`⚠️ [FORCE LOAD] No se pudieron cargar datos: ${result.error || 'sin nombre'}`);
      return { name: null, phone: null };
    }
  } catch (err: any) {
    logger.debug(`[FORCE LOAD] Error: ${err.message}`);
    return { name: null, phone: null };
  }
}

/**
 * FUNCIÓN LEGACY: Fuerza la sincronización de metadatos del grupo
 * Simula la apertura del panel de información del grupo para que WhatsApp
 * cargue los datos de los participantes (nombres, pushnames, etc.)
 * 
 * NOTA: Usar forceLoadContactData() para contactos específicos (más efectivo)
 */
export async function forceGroupMetadataSync(client: any, groupId: string): Promise<boolean> {
  if (!client?.pupPage) return false;

  try {
    const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;

    logger.info(`🔄 [FORCE SYNC] Forzando sincronización de metadatos para grupo ${groupId}...`);

    const result = await client.pupPage.evaluate(async (gJid: string) => {
      try {
        // @ts-ignore
        const store = window.Store;
        if (!store) return { success: false, error: 'Store not available' };

        // Obtener el chat del grupo
        const chat = store.Chat?.get(gJid);
        if (!chat) return { success: false, error: 'Chat not found' };

        // ESTRATEGIA CLAVE: Simular apertura del panel de info del grupo
        // Esto fuerza a WhatsApp a cargar los metadatos de participantes
        if (store.Cmd) {
          try {
            // 1. Abrir el chat (esto activa el contexto)
            if (store.Cmd.openChatBottom) {
              await store.Cmd.openChatBottom(chat);
            }

            // 2. Abrir el panel de información del grupo
            // ESTO ES LO QUE FUERZA LA CARGA DE METADATOS
            if (store.Cmd.openDrawerMid) {
              await store.Cmd.openDrawerMid(chat);
            } else if (store.Cmd.openCurrentChatInfo) {
              await store.Cmd.openCurrentChatInfo();
            }

            // 3. Esperar a que se sincronice (el servidor envía los datos)
            await new Promise(r => setTimeout(r, 1500));

            // 4. Cerrar el panel para no interferir con la UI
            if (store.Cmd.closeDrawerRight) {
              await store.Cmd.closeDrawerRight();
            } else if (store.Cmd.closeActiveChat) {
              // No cerrar el chat activo, solo el drawer
            }

            return { success: true, method: 'Cmd.openDrawerMid' };
          } catch (cmdErr) {
            // Continuar con método alternativo
          }
        }

        // Método alternativo: Forzar queryGroupParticipants directamente
        if (store.GroupMetadata && typeof store.GroupMetadata.queryAndUpdate === 'function') {
          try {
            await store.GroupMetadata.queryAndUpdate(gJid);
            await new Promise(r => setTimeout(r, 1000));
            return { success: true, method: 'GroupMetadata.queryAndUpdate' };
          } catch (e) { }
        }

        // Otro método: Usar la función de refresh
        if (chat.groupMetadata && typeof chat.groupMetadata.refresh === 'function') {
          try {
            await chat.groupMetadata.refresh();
            await new Promise(r => setTimeout(r, 1000));
            return { success: true, method: 'groupMetadata.refresh' };
          } catch (e) { }
        }

        return { success: false, error: 'No sync method available' };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }, groupJid);

    if (result.success) {
      logger.info(`✅ [FORCE SYNC] Sincronización forzada exitosa vía ${result.method}`);
      return true;
    } else {
      logger.warn(`⚠️ [FORCE SYNC] No se pudo forzar sincronización: ${result.error}`);
      return false;
    }
  } catch (err: any) {
    logger.debug(`[FORCE SYNC] Error: ${err.message}`);
    return false;
  }
}

/**
 * NUEVA FUNCIÓN: Extrae el nombre de un participante después de forzar sync
 * Esta función debe llamarse DESPUÉS de forceGroupMetadataSync
 */
export async function extractParticipantNameAfterSync(
  client: any,
  groupId: string,
  participantId: string
): Promise<{ name: string | null; phone: string | null }> {
  if (!client?.pupPage) return { name: null, phone: null };

  try {
    const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;

    const result = await client.pupPage.evaluate(async (gJid: string, pId: string) => {
      try {
        // @ts-ignore
        const store = window.Store;
        if (!store) return null;

        // Helper para validar nombres
        const isValidName = (n: any): boolean => {
          if (!n || typeof n !== 'string') return false;
          const t = n.trim();
          return t.length > 0 && t !== 'undefined' && t.toLowerCase() !== 'null';
        };

        // 1. Buscar en Contact Store (debería estar actualizado post-sync)
        // CRÍTICO: pushname es el perfil de WhatsApp, NO usar contact.name (contactos guardados)
        if (store.Contact) {
          const contact = store.Contact.get(pId);
          if (contact) {
            const name = contact.pushname || contact.verifiedName || contact.notifyName;
            const phone = contact.number || contact.phoneNumber;
            if (isValidName(name)) {
              return { name, phone, source: 'Contact' };
            }
          }
        }

        // 2. Buscar en GroupMetadata (ahora debería tener datos completos)
        if (store.GroupMetadata) {
          const groupMeta = store.GroupMetadata.get(gJid);
          if (groupMeta && groupMeta.participants) {
            const participants = Array.isArray(groupMeta.participants)
              ? groupMeta.participants
              : (groupMeta.participants.getModelsArray ? groupMeta.participants.getModelsArray() : []);

            if (Array.isArray(participants)) {
              for (const p of participants) {
                const pIdStr = p.id?._serialized || p.id;
                if (pIdStr === pId) {
                  const name = p.pushname || p.notify || p.name || p.contact?.pushname;
                  const phone = p.number || p.contact?.number;
                  if (isValidName(name)) {
                    return { name, phone, source: 'GroupMetadata' };
                  }
                }
              }
            }
          }
        }

        // 3. Buscar en Chat.contact si existe
        if (store.Chat) {
          const chat = store.Chat.get(pId);
          if (chat && chat.contact) {
            const name = chat.contact.pushname || chat.contact.name;
            if (isValidName(name)) {
              return { name, phone: chat.contact.number, source: 'Chat.contact' };
            }
          }
        }

        // 4. Intentar obtener del WID si tenemos mapeo
        // A veces el LID tiene un WID asociado después del sync
        if (store.WidFactory && pId.includes('@lid')) {
          try {
            const contact = store.Contact.get(pId);
            if (contact && contact.wid) {
              const widContact = store.Contact.get(contact.wid._serialized);
              if (widContact && isValidName(widContact.pushname)) {
                return {
                  name: widContact.pushname,
                  phone: widContact.number,
                  source: 'WID mapping'
                };
              }
            }
          } catch (e) { }
        }

        return null;
      } catch (e) {
        return null;
      }
    }, groupJid, participantId);

    if (result) {
      logger.info(`✅ Nombre extraído post-sync (${result.source}): "${result.name}"`);

      // Cachear el resultado
      if (result.name) {
        lidNameCache.set(participantId, { name: result.name, timestamp: Date.now() });
      }

      return { name: result.name, phone: result.phone };
    }

    return { name: null, phone: null };
  } catch (err: any) {
    logger.debug(`[extractParticipantNameAfterSync] Error: ${err.message}`);
    return { name: null, phone: null };
  }
}

/**
 * Resuelve un LID a su número real consultando metadatos del grupo
 * Adaptado para whatsapp-web.js
 * @param {object} client - Cliente de whatsapp-web.js
 * @param {string} groupId - ID del grupo
 * @param {string} lid - LID a resolver (ej: "91401836589109@lid")
 * @returns {Promise<string>} - Número real o vacío si no se puede resolver
 */
export async function resolveLidToPhone(client, groupId, lid) {
  if (!client || !groupId || !lid) return '';

  // Verificar cache
  const cacheKey = `${groupId}:${lid}`;
  const cached = lidCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.info(`✅ LID resuelto desde cache: ${lid} → ${cached.phone}`);
    return cached.phone;
  }

  try {
    // Obtener el chat/grupo con whatsapp-web.js
    const normalizedGroupId = normalizeGroupId(groupId);
    const groupJid = normalizedGroupId.includes('@') ? normalizedGroupId : `${normalizedGroupId}@g.us`;

    // ESTRATEGIA 1: Usar Puppeteer directamente para grupos grandes
    // Esto es más confiable que getChatById en grupos grandes
    if (client.pupPage) {
      try {
        const result = await client.pupPage.evaluate(async (gJid: string, lidToResolve: string) => {
          try {
            // @ts-ignore
            const store = window.Store;
            if (!store) return null;

            const lidPrefix = lidToResolve.replace('@lid', '').replace(/[^\d]/g, '');

            // Intentar obtener metadatos del grupo
            if (store.GroupMetadata) {
              const groupMeta = store.GroupMetadata.get(gJid);
              if (groupMeta && groupMeta.participants) {
                const participants = Array.isArray(groupMeta.participants)
                  ? groupMeta.participants
                  : (groupMeta.participants.getModelsArray ? groupMeta.participants.getModelsArray() : []);

                if (Array.isArray(participants)) {
                  // Buscar coincidencia exacta primero
                  for (const p of participants) {
                    const pId = p.id?._serialized || p.id;
                    if (pId === lidToResolve) {
                      // Si el participante tiene un número real asociado
                      if (p.number && /^\d+$/.test(p.number)) {
                        return { phone: p.number, name: p.pushname || p.notify, source: 'exact_match' };
                      }
                    }
                  }

                  // Buscar por prefijo numérico del LID
                  for (const p of participants) {
                    const pId = p.id?._serialized || p.id;
                    const userPart = pId?.split('@')[0] || '';
                    if (userPart.includes(lidPrefix)) {
                      return { phone: userPart, name: p.pushname || p.notify, source: 'prefix_match' };
                    }
                  }
                }
              }
            }

            // Intentar resolver mediante Contact
            if (store.Contact) {
              const contact = store.Contact.get(lidToResolve);
              if (contact && contact.number) {
                return { phone: contact.number, name: contact.pushname, source: 'contact' };
              }
            }

            return null;
          } catch (e) {
            return null;
          }
        }, groupJid, lid);

        if (result && result.phone) {
          const realPhone = normalizePhone(result.phone);
          if (realPhone && realPhone.length >= 8 && realPhone.length <= 15) {
            lidCache.set(cacheKey, { phone: realPhone, timestamp: Date.now() });

            // Cachear también el nombre si lo tenemos
            if (result.name) {
              lidNameCache.set(lid, { name: result.name, timestamp: Date.now() });
            }

            logger.info(`✅ LID resuelto vía Puppeteer (${result.source}): ${lid} → ${realPhone}`);
            return realPhone;
          }
        }
      } catch (pupErr: any) {
        logger.debug(`Puppeteer LID resolution failed: ${pupErr.message}`);
      }
    }

    // ESTRATEGIA 2: Método tradicional con getChatById (puede fallar en grupos grandes)
    let chat;
    try {
      chat = await client.getChatById(groupJid);
    } catch (chatErr: any) {
      logger.warn(`⚠️ No se pudo resolver LID ${lid} en grupo ${normalizedGroupId}`);
      return '';
    }

    if (!chat || !chat.isGroup) {
      logger.warn(`⚠️ Chat ${normalizedGroupId} no es un grupo o no existe`);
      return '';
    }

    // Obtener participantes
    const participants = chat.participants || [];

    // Extraer el prefijo del LID (la parte antes de @lid)
    const lidPrefix = lid.replace('@lid', '').replace(/[^\d]/g, '');

    logger.debug(`🔍 Buscando LID ${lid} (prefix: ${lidPrefix}) entre ${participants.length} participantes`);

    // Buscar coincidencia exacta de LID en participant.id
    for (const participant of participants) {
      const participantId = participant.id?._serialized || participant.id;

      if (participantId === lid) {
        // Si encontramos el LID en participantes, verificar si tiene nombre ahí mismo
        const rawName = participant.pushname || participant.notify || participant.name;
        if (rawName) {
          logger.info(`ℹ️ LID encontrado en participantes con nombre: ${rawName}`);
          // Cachear el nombre
          lidNameCache.set(lid, { name: rawName, timestamp: Date.now() });
        }
      }
    }

    // Buscar por prefijo numérico del LID
    for (const participant of participants) {
      const participantId = participant.id?._serialized || participant.id;
      const userPart = participant.id?.user || participantId.split('@')[0];

      // Si el participant contiene el prefijo del LID
      if (userPart && userPart.includes(lidPrefix)) {
        const realPhone = normalizePhone(userPart);
        if (realPhone && realPhone.length >= 8 && realPhone.length <= 15 && !realPhone.includes('@')) {
          lidCache.set(cacheKey, { phone: realPhone, timestamp: Date.now() });
          logger.info(`✅ LID resuelto (prefix match): ${lid} → ${realPhone}`);
          return realPhone;
        }
      }
    }

    // Si no se encuentra, listar los primeros 5 para debugging
    logger.warn(`⚠️ No se pudo resolver LID ${lid} en grupo ${normalizedGroupId}`);
    logger.debug(`Primeros 5 participantes: ${participants.slice(0, 5).map(p => p.id?._serialized || p.id).join(', ')}`);
    return '';

  } catch (error) {
    logger.error(`❌ Error al resolver LID ${lid}:`, error);
    return '';
  }
}

/**
 * Obtiene el nombre cacheado para un LID (si existe)
 */
export function getCachedLidName(lid: string): string | null {
  const cached = lidNameCache.get(lid);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.name;
  }
  return null;
}

/**
 * Limpia el cache de LIDs (ejecutar periódicamente)
 */
export function clearLidCache() {
  const now = Date.now();
  let cleared = 0;

  for (const [key, value] of lidCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      lidCache.delete(key);
      cleared++;
    }
  }

  for (const [key, value] of lidNameCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      lidNameCache.delete(key);
      cleared++;
    }
  }

  if (cleared > 0) {
    logger.info(`🧹 Cache de LIDs limpiado: ${cleared} entradas eliminadas`);
  }
}

// Limpiar cache cada 5 minutos
setInterval(clearLidCache, CACHE_TTL);

export default {
  resolveLidToPhone,
  clearLidCache,
  getCachedLidName,
  forceGroupMetadataSync,
  extractParticipantNameAfterSync
};
