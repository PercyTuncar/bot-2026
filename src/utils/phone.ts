/**
 * Utilidades para manejo de números de teléfono y IDs de WhatsApp
 */

import { WAMessage } from '../types/whatsapp.types.js';

/**
 * Normaliza un número de teléfono de WhatsApp
 * @param phone - Número de teléfono (puede incluir @s.whatsapp.net)
 * @returns Número normalizado (ej: 549111234567) o vacío si es LID
 */
export function normalizePhone(phone: string | any): string {
  if (!phone) return '';

  // Extraer ID si es un objeto
  let normalized = extractIdFromWid(phone);
  if (!normalized) return '';

  // CRITICAL: Rechazar LIDs completamente para normalización de teléfono
  // Los LIDs son identificadores temporales de dispositivos vinculados, NO números reales
  if (normalized.includes('@lid') || normalized.includes('lid')) {
    return '';
  }

  // Remover @s.whatsapp.net y @c.us si existen
  normalized = normalized.replace('@s.whatsapp.net', '')
    .replace('@c.us', '')
    .trim();

  // Handle device ADs (e.g. 12345:0) - Take only the part before ':'
  if (normalized.includes(':')) {
    normalized = normalized.split(':')[0];
  }

  // Remover caracteres no numéricos excepto +
  normalized = normalized.replace(/[^\d+]/g, '');

  // Si empieza con +, removerlo
  if (normalized.startsWith('+')) {
    normalized = normalized.substring(1);
  }

  // Validar que sea un número de teléfono válido (mínimo 8 dígitos)
  if (normalized.length < 8) {
    return '';
  }

  return normalized;
}

/**
 * Convierte cualquier ID al formato estándar de teléfono (@s.whatsapp.net)
 * @param client - Cliente de WhatsApp (Baileys socket)
 * @param rawId - El ID recibido (ej: "12345@lid" o "51999@s.whatsapp.net")
 * @returns El ID estandarizado (ej: "51999@s.whatsapp.net") o el mismo ID si no se pudo resolver
 */
export async function getCanonicalId(client: any, rawId: string): Promise<string> {
  if (!rawId) return '';

  // Normalize to @s.whatsapp.net (Baileys standard)
  if (rawId.endsWith('@c.us')) {
    rawId = rawId.replace('@c.us', '@s.whatsapp.net');
  }

  // Si ya es s.whatsapp.net, devolverlo directamente
  if (rawId.endsWith('@s.whatsapp.net')) return rawId;

  // Si no es un LID, intentar normalizarlo
  if (!rawId.includes('@lid')) {
    const normalized = normalizePhone(rawId);
    return normalized ? `${normalized}@s.whatsapp.net` : rawId;
  }

  try {
    // For Baileys: use onWhatsApp to check if number exists
    if (!client || !client.onWhatsApp) return rawId;

    // Extract numeric part from LID
    const numericPart = rawId.split('@')[0].replace(/[^\d]/g, '');
    if (numericPart.length >= 8) {
      const result = await client.onWhatsApp(numericPart);
      if (result && result[0] && result[0].exists) {
        return result[0].jid;
      }
    }

    // Si es un LID y no pudimos resolverlo, devolvemos el rawId
    return rawId;
  } catch (error) {
    return rawId;
  }
}

/**
 * Extrae el ID string de un objeto WID de WhatsApp
 * @param wid - Objeto WID o string
 * @returns ID como string o vacío si no se puede extraer
 */
export function extractIdFromWid(wid: any): string {
  if (!wid) return '';

  // Si ya es string, retornarlo
  if (typeof wid === 'string') {
    return wid;
  }

  // Si es un objeto, intentar extraer el ID
  if (typeof wid === 'object') {
    // Intentar _serialized primero (formato más común)
    if (wid._serialized && typeof wid._serialized === 'string') {
      return wid._serialized;
    }

    // Intentar user@server
    if (wid.user && wid.server) {
      return `${wid.user}@${wid.server}`;
    }

    // Intentar id._serialized
    if (wid.id) {
      if (typeof wid.id === 'string') {
        return wid.id;
      }
      if (wid.id._serialized && typeof wid.id._serialized === 'string') {
        return wid.id._serialized;
      }
      if (wid.id.user && wid.id.server) {
        return `${wid.id.user}@${wid.id.server}`;
      }
    }
  }

  // Si String(wid) da [object Object], retornar vacío
  const stringified = String(wid).trim();
  if (stringified === '[object Object]') {
    return '';
  }

  return stringified;
}

/**
 * Normaliza un ID de grupo de WhatsApp
 * @param groupId - ID del grupo (puede incluir @g.us, @lid, etc.) o objeto WID
 * @returns ID normalizado sin sufijos (ej: 120363276446666223)
 */
export function normalizeGroupId(groupId: string | any): string {
  if (!groupId) return '';

  // Extraer el ID string del objeto si es necesario
  const idString = extractIdFromWid(groupId);
  if (!idString) return '';

  // Remover sufijos de WhatsApp (@g.us, @lid, etc.)
  let normalized = idString.replace(/@g\.us|@lid|@broadcast|@newsletter/g, '').trim();

  return normalized;
}

/**
 * Convierte un número normalizado a JID de WhatsApp
 * @param phone - Número normalizado o LID
 * @returns JID completo (ej: 549111234567@s.whatsapp.net o 12345@lid)
 */
export function phoneToJid(phone: string): string {
  if (!phone) return '';
  // Si ya es un LID, retornarlo tal cual
  if (phone.includes('@lid')) return phone;

  const normalized = normalizePhone(phone);
  // Si normalizePhone falló pero el input parece válido (no vacío), retornar input + suffix por seguridad,
  // pero idealmente normalizePhone debería haber funcionado.
  if (!normalized && phone) return `${phone}@s.whatsapp.net`;

  return `${normalized}@s.whatsapp.net`;
}

/**
 * Convierte un ID de grupo normalizado a JID completo
 * @param groupId - ID de grupo normalizado
 * @returns JID completo (ej: 120363276446666223@g.us)
 */
export function groupIdToJid(groupId: string): string {
  const normalized = normalizeGroupId(groupId);
  return `${normalized}@g.us`;
}

/**
 * Formatea un número de teléfono para mostrar
 * @param phone - Número normalizado
 * @returns Número formateado (ej: +54 9 11 1234-5678)
 */
export function formatPhone(phone: string): string {
  const normalized = normalizePhone(phone);

  if (normalized.length >= 10) {
    // Formato para números argentinos
    if (normalized.startsWith('54')) {
      const country = normalized.substring(0, 2);
      const area = normalized.substring(2, 4);
      const part1 = normalized.substring(4, 8);
      const part2 = normalized.substring(8);
      return `+${country} ${area} ${part1}-${part2}`;
    }
  }

  return `+${normalized}`;
}

/**
 * Obtiene el identificador único del usuario desde un mensaje
 * PRIORIDAD: LID completo > Número de teléfono > null
 * CRITICAL: Esta función SIEMPRE retorna LIDs cuando están disponibles
 * @param msg - Mensaje de WhatsApp
 * @param isGroup - Si el mensaje es de un grupo
 * @returns LID completo (ej: "91401836589109@lid") o número normalizado
 */
export function getUserId(msg: WAMessage, isGroup: boolean = false): string {
  if (!msg) return '';

  // Helper para extraer ID string de un valor que puede ser string u objeto WID
  const extractId = (value: any): string => {
    if (!value) return '';
    // Si ya es string, retornarlo
    if (typeof value === 'string') return value;
    // Si es objeto, usar extractIdFromWid
    return extractIdFromWid(value);
  };

  // DEBUG: Log all relevant message fields
  const msgAny = msg as any;
  console.log(`[getUserId] DEBUG - isGroup=${isGroup}`);
  console.log(`[getUserId] msg.author=${typeof msg.author === 'string' ? msg.author : JSON.stringify(msg.author)}`);
  console.log(`[getUserId] msg.from=${typeof msg.from === 'string' ? msg.from : JSON.stringify(msg.from)}`);
  console.log(`[getUserId] msg._data?.participant=${msgAny._data?.participant}`);
  console.log(`[getUserId] msg._data?.id?.participant=${JSON.stringify(msgAny._data?.id?.participant)}`);

  if (isGroup) {
    // PRIORIDAD 1: msg.author (puede ser LID o número, string u objeto)
    if (msg.author) {
      const authorId = extractId(msg.author);
      console.log(`[getUserId] P1: authorId extracted = ${authorId}`);
      if (authorId) {
        // Si es LID, retornarlo COMPLETO
        if (authorId.includes('@lid')) {
          console.log(`[getUserId] P1: Returning LID: ${authorId}`);
          return authorId; // Retornar LID completo: "91401836589109@lid"
        }
        // Si no es LID, normalizar como número
        const normalized = normalizePhone(authorId);
        if (normalized) {
          console.log(`[getUserId] P1: Returning normalized: ${normalized}`);
          return normalized;
        }
      }
    }

    // PRIORIDAD 2: msg._data.participant (puede ser string u objeto)
    if (msg._data?.participant) {
      const participantId = extractId(msg._data.participant);
      console.log(`[getUserId] P2: participantId extracted = ${participantId}`);
      if (participantId) {
        if (participantId.includes('@lid')) {
          console.log(`[getUserId] P2: Returning LID: ${participantId}`);
          return participantId;
        }
        const normalized = normalizePhone(participantId);
        if (normalized) {
          console.log(`[getUserId] P2: Returning normalized: ${normalized}`);
          return normalized;
        }
      }
    }

    // PRIORIDAD 3: msg._data.id.participant (estructura alternativa en whatsapp-web.js)
    const msgDataAny = msg._data as any;
    if (msgDataAny?.id?.participant) {
      const participantId = extractId(msgDataAny.id.participant);
      console.log(`[getUserId] P3: participantId from id = ${participantId}`);
      if (participantId) {
        if (participantId.includes('@lid')) {
          console.log(`[getUserId] P3: Returning LID: ${participantId}`);
          return participantId;
        }
        const normalized = normalizePhone(participantId);
        if (normalized) {
          console.log(`[getUserId] P3: Returning normalized: ${normalized}`);
          return normalized;
        }
      }
    }

    // PRIORIDAD 4: msg.from (si no es el grupo mismo)
    if (msg.from) {
      const fromId = extractId(msg.from);
      console.log(`[getUserId] P4: fromId = ${fromId}`);
      if (fromId && !fromId.endsWith('@g.us')) {
        if (fromId.includes('@lid')) {
          console.log(`[getUserId] P4: Returning LID: ${fromId}`);
          return fromId;
        }
        const normalized = normalizePhone(fromId);
        if (normalized) {
          console.log(`[getUserId] P4: Returning normalized: ${normalized}`);
          return normalized;
        }
      } else {
        console.log(`[getUserId] P4: Skipped - fromId is group: ${fromId}`);
      }
    }
  } else {
    // En DM: priorizar msg.from
    if (msg.from) {
      const fromId = extractId(msg.from);
      if (fromId) {
        if (fromId.includes('@lid')) {
          return fromId;
        }
        const normalized = normalizePhone(fromId);
        if (normalized) return normalized;
      }
    }

    // Fallback: msg.author
    if (msg.author) {
      const authorId = extractId(msg.author);
      if (authorId) {
        if (authorId.includes('@lid')) {
          return authorId;
        }
        const normalized = normalizePhone(authorId);
        if (normalized) return normalized;
      }
    }
  }

  return '';
}

/**
 * @deprecated Usar getUserId() en su lugar, que maneja LIDs correctamente
 */
export function getUserPhoneFromMessage(msg: WAMessage, isGroup: boolean = false): string {
  if (!msg) return '';

  let phone = '';

  if (isGroup) {
    if (msg.author) {
      phone = normalizePhone(msg.author);
      if (phone) return phone;
    }

    if (msg._data && msg._data.participant) {
      phone = normalizePhone(msg._data.participant);
      if (phone) return phone;
    }
  } else {
    if (msg.from) {
      phone = normalizePhone(msg.from);
      if (phone) return phone;
    }

    if (msg.to && msg.to.endsWith('@c.us')) {
      phone = normalizePhone(msg.to);
      if (phone) return phone;
    }

    if (msg.author) {
      phone = normalizePhone(msg.author);
      if (phone) return phone;
    }

    if (msg._data && msg._data.from) {
      phone = normalizePhone(msg._data.from);
      if (phone) return phone;
    }
  }

  return '';
}

/**
 * Extrae displayName del mensaje (nombre del usuario en WhatsApp)
 * @param msg - Mensaje de WhatsApp
 * @param fallbackPhone - Número de teléfono como fallback
 * @returns DisplayName o número como fallback
 */
export function getDisplayNameFromMessage(msg: WAMessage, fallbackPhone: string = ''): string {
  if (!msg) return fallbackPhone;

  // 1. msg.pushName es el nombre que el usuario configuró en WhatsApp
  if (msg._data && (msg._data as any).pushName && (msg._data as any).pushName.trim().length > 0) {
    return (msg._data as any).pushName.trim();
  }

  // 2. msg.notifyName (baileys)
  if ((msg as any).notifyName && (msg as any).notifyName.trim().length > 0) {
    return (msg as any).notifyName.trim();
  }

  // 3. msg.verifiedName (WhatsApp Business)
  if ((msg as any).verifiedName && (msg as any).verifiedName.trim().length > 0) {
    return (msg as any).verifiedName.trim();
  }

  // 4. Fallback al número
  return fallbackPhone || 'Usuario';
}

export default {
  normalizePhone,
  normalizeGroupId,
  phoneToJid,
  groupIdToJid,
  formatPhone,
  getUserPhoneFromMessage,
  getUserId,
  getDisplayNameFromMessage,
  extractIdFromWid,
  getCanonicalId
};
