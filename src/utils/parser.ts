import { config } from '../config/environment.js';
import logger from '../lib/logger.js';

/**
 * Parsea un mensaje para extraer comando y argumentos
 * @param {string} text - Texto del mensaje
 * @returns {object} - { command, args, raw }
 */
export function parseCommand(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const trimmed = text.trim();

  if (!trimmed.startsWith(config.bot.prefix)) {
    return null;
  }

  const withoutPrefix = trimmed.substring(config.bot.prefix.length).trim();
  const parts = withoutPrefix.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  // Preservar el texto después del comando con saltos de línea intactos
  // Buscar el inicio del primer argumento después del comando
  const commandEndIndex = withoutPrefix.indexOf(command) + command.length;
  const rawArgs = withoutPrefix.substring(commandEndIndex).trim();

  return {
    command,
    args,
    raw: withoutPrefix,
    rawArgs  // Texto después del comando, con saltos de línea preservados
  };
}

/**
 * Extrae menciones de un mensaje
 * @param {object} msg - Mensaje de whatsapp-web.js
 * @returns {array} - Array de números de teléfono mencionados (excluye LIDs)
 */
export function extractMentions(msg) {
  const mentions = [];
  const seen = new Set();

  // 1. Try whatsapp-web.js list - PERO filtrar LIDs
  if (msg.mentionedJidList && msg.mentionedJidList.length > 0) {
    for (const jid of msg.mentionedJidList) {
      // CRÍTICO: Ignorar LIDs - solo aceptar @s.whatsapp.net o @c.us
      if (jid.endsWith('@lid')) {
        continue; // Saltar LIDs, no son números reales
      }
      const phone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
      // Validar que sea un número de teléfono real (8-14 dígitos)
      // LIDs tienen típicamente 14-18+ dígitos
      if (phone.length >= 8 && phone.length <= 14 && /^\d+$/.test(phone) && !seen.has(phone)) {
        mentions.push(phone);
        seen.add(phone);
      }
    }
  }

  // 2. Fallback: Regex extraction from body - SOLO si no hay menciones válidas
  // NOTA: Esto puede capturar LIDs renderizados en el texto, así que validamos longitud estrictamente
  if (mentions.length === 0) {
    const text = msg.body || '';
    const regex = /@(\d+)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const phone = match[1];
      // Validación estricta: números de teléfono reales tienen 8-14 dígitos
      // LIDs tienen típicamente 14-18+ dígitos (ej: 184980080701681 = 15 dígitos)
      // Los números de teléfono más largos son ~14 dígitos (ej: +5493624692191)
      if (phone.length >= 8 && phone.length <= 14 && !seen.has(phone)) {
        mentions.push(phone);
        seen.add(phone);
      }
    }
  }

  return mentions;
}

/**
 * Extrae el primer número mencionado
 * @param {object} msg - Mensaje de whatsapp-web.js
 * @returns {string|null} - Número mencionado o null
 */
export function getFirstMention(msg) {
  const mentions = extractMentions(msg);
  return mentions.length > 0 ? mentions[0] : null;
}

/**
 * Obtiene menciones usando el método nativo getMentions() de whatsapp-web.js
 * Este método es más confiable ya que devuelve objetos Contact completos
 * @param {object} msg - Mensaje de whatsapp-web.js
 * @returns {Promise<Array>} - Array de objetos Contact mencionados
 */
export async function getMentionsAsync(msg) {
  try {
    if (typeof msg.getMentions === 'function') {
      const mentions = await msg.getMentions();
      return mentions || [];
    }
  } catch (error) {
    // Fallback silencioso si getMentions falla
  }
  return [];
}

/**
 * Obtiene el primer Contact mencionado usando getMentions() nativo
 * @param {object} msg - Mensaje de whatsapp-web.js
 * @returns {Promise<object|null>} - Objeto Contact o null
 */
export async function getFirstMentionAsync(msg) {
  const mentions = await getMentionsAsync(msg);
  return mentions.length > 0 ? mentions[0] : null;
}

/**
 * Extrae información útil de un Contact mencionado
 * Maneja correctamente LIDs convirtiéndolos a números reales
 * @param {object} contact - Objeto Contact de whatsapp-web.js
 * @param {boolean} allowLid - Si es true, permite retornar LID como phone cuando no hay número real
 * @returns {object} - { id, phone, name, jid, isLid } o null si es un LID sin número real (y allowLid=false)
 */
export function extractContactInfo(contact, allowLid = false) {
  if (!contact) return null;
  
  const rawId = contact.id?._serialized || contact.id || '';
  const isLid = rawId.endsWith('@lid');
  
  // Obtener el número real - priorizar contact.number que es más confiable
  let phone = contact.number || '';
  
  // Si no hay number, intentar con id.user SOLO si no es un LID
  if (!phone && contact.id?.user && !isLid) {
    phone = contact.id.user;
  }
  
  // Si aún no hay phone y es un LID
  if (!phone && isLid) {
    if (allowLid) {
      // Extraer la parte numérica del LID para usar como identificador
      const lidNumber = rawId.replace('@lid', '').split(':')[0];
      phone = lidNumber;
    } else {
      // Si no se permite LID, retornar null
      return null;
    }
  }
  
  // Si no es LID, podemos extraer del rawId
  if (!phone && !isLid) {
    phone = rawId.split('@')[0] || '';
  }
  
  // Limpiar el phone de cualquier sufijo
  phone = phone.replace(/@.*$/, '');
  
  // Validar que sea un número (puede ser número de teléfono o LID numérico)
  if (!phone || !/^\d+$/.test(phone)) {
    return null;
  }
  
  // Si no es LID y no está en rango de teléfono válido, rechazar
  if (!isLid && (phone.length < 8 || phone.length > 14)) {
    return null;
  }
  
  // Nombre para mostrar con cascada de prioridades
  const name = contact.pushname || contact.name || contact.shortName || phone || 'Usuario';
  
  // Construir JID correcto
  const jid = isLid ? rawId : `${phone}@s.whatsapp.net`;
  
  return {
    id: rawId,
    phone,
    name,
    jid,
    isLid
  };
}

/**
 * SOLUCIÓN ROBUSTA: Obtiene el usuario objetivo de un comando de moderación
 * Soporta múltiples estrategias para resolver LIDs a números reales:
 * 1. RESPONDER AL MENSAJE (más seguro) - El admin responde al mensaje del usuario
 * 2. getMentions() nativo - Funciona cuando hay número real
 * 3. mentionedJidList + búsqueda en participantes del grupo - Para resolver LIDs
 * 4. Fallback de texto - Solo números válidos (8-14 dígitos)
 * 
 * @param {object} msg - Mensaje de whatsapp-web.js
 * @param {object} chat - Chat object (opcional, para buscar participantes)
 * @returns {Promise<object|null>} - { contact, phone, name, jid, method } o null
 */
export async function getTargetUser(msg, chat = null) {
  let targetContact = null;
  let method = null;

  logger.info(`[getTargetUser] Starting - hasQuotedMsg=${msg.hasQuotedMsg}`);

  // ESTRATEGIA 1: Verificar si el comando es una respuesta a otro mensaje (MÁS SEGURO)
  if (msg.hasQuotedMsg) {
    try {
      const quotedMsg = await msg.getQuotedMessage();
      logger.info(`[getTargetUser] Strategy 1: Got quoted message`);
      
      if (quotedMsg) {
        // NUEVO: Extraer información directamente del quotedMsg sin usar getContact()
        // porque getContact() puede fallar con errores de WhatsApp Web Store
        const quotedAuthor = quotedMsg.author || quotedMsg.from || quotedMsg._data?.author || quotedMsg._data?.from;
        const quotedParticipant = quotedMsg._data?.participant || quotedMsg._data?.id?.participant;
        const authorId = quotedAuthor || quotedParticipant;
        
        logger.info(`[getTargetUser] Strategy 1: quotedAuthor=${quotedAuthor}, quotedParticipant=${quotedParticipant}, authorId=${authorId}`);
        
        if (authorId) {
          const isLid = authorId.includes('@lid');
          let phone = '';
          let jid = authorId;
          
          if (isLid) {
            // Es un LID - extraer la parte numérica
            const lidNumber = authorId.replace('@lid', '').split(':')[0];
            phone = lidNumber;
            jid = authorId;
            logger.info(`[getTargetUser] Strategy 1: Detected LID - lidNumber=${lidNumber}`);
            
            // Intentar buscar en participantes del grupo para obtener más info
            let displayName = quotedMsg._data?.notifyName || quotedMsg.pushName || lidNumber;
            
            if (chat && chat.isGroup && chat.participants) {
              const participant = chat.participants.find(p => 
                p.id._serialized === authorId || 
                p.id._serialized?.includes(lidNumber)
              );
              if (participant) {
                // Intentar obtener el número real del participante
                if (participant.id?.user && !participant.id._serialized?.includes('@lid')) {
                  phone = participant.id.user;
                  jid = `${phone}@s.whatsapp.net`;
                  logger.info(`[getTargetUser] Strategy 1: Found real number from participant: ${phone}`);
                }
              }
            }
            
            return {
              contact: null,
              phone: phone,
              name: displayName,
              jid: jid,
              method: 'quoted',
              isLid: true
            };
          } else {
            // Es un número normal
            phone = authorId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@g.us', '');
            jid = `${phone}@s.whatsapp.net`;
            const displayName = quotedMsg._data?.notifyName || quotedMsg.pushName || phone;
            
            // Validar que sea un número válido
            if (phone && /^\d{8,15}$/.test(phone)) {
              logger.info(`[getTargetUser] Strategy 1: Found normal number: ${phone}`);
              return {
                contact: null,
                phone: phone,
                name: displayName,
                jid: jid,
                method: 'quoted',
                isLid: false
              };
            }
          }
        }
        
        // Fallback: Intentar con getContact() si lo anterior no funcionó
        try {
          targetContact = await quotedMsg.getContact();
          logger.info(`[getTargetUser] Strategy 1 fallback: Contact - id=${targetContact?.id?._serialized}, number=${targetContact?.number}, pushname=${targetContact?.pushname}`);
          method = 'quoted';
          
          const info = extractContactInfo(targetContact);
          logger.info(`[getTargetUser] Strategy 1 fallback: extractContactInfo result=${JSON.stringify(info)}`);
          if (info && info.phone) {
            return {
              contact: targetContact,
              phone: info.phone,
              name: info.name,
              jid: info.jid,
              method,
              isLid: info.isLid
            };
          }
        } catch (contactError) {
          logger.warn(`[getTargetUser] Strategy 1 fallback getContact() failed: ${contactError.message}`);
        }
      }
    } catch (error) {
      logger.error(`[getTargetUser] Strategy 1 error: ${error.message}`);
    }
  }

  // ESTRATEGIA 2: Verificar si hay menciones explícitas usando getMentions() nativo
  if (!targetContact) {
    try {
      const mentions = await getMentionsAsync(msg);
      logger.info(`[getTargetUser] Strategy 2: getMentions() returned ${mentions?.length || 0} contacts`);
      if (mentions && mentions.length > 0) {
        for (let i = 0; i < mentions.length; i++) {
          const mention = mentions[i];
          logger.info(`[getTargetUser] Strategy 2: Mention[${i}] - id=${mention?.id?._serialized}, number=${mention?.number}, pushname=${mention?.pushname}`);
          const info = extractContactInfo(mention);
          logger.info(`[getTargetUser] Strategy 2: extractContactInfo[${i}] result=${JSON.stringify(info)}`);
          if (info && info.phone) {
            return {
              contact: mention,
              phone: info.phone,
              name: info.name,
              jid: info.jid,
              method: 'mention',
              isLid: info.isLid
            };
          }
        }
      }
    } catch (error) {
      logger.error(`[getTargetUser] Strategy 2 error: ${error.message}`);
    }
  }

  // ESTRATEGIA 3: Si hay LID en mentionedJidList, buscar en participantes del grupo
  const mentionedJids = msg.mentionedIds || msg._data?.mentionedJidList || [];
  logger.info(`[getTargetUser] Strategy 3: mentionedJids=${JSON.stringify(mentionedJids)}`);
  
  if (mentionedJids.length > 0) {
    const mentionedLid = mentionedJids[0]; // Primer LID mencionado
    logger.info(`[getTargetUser] Strategy 3: Processing mentionedLid=${mentionedLid}`);
    
    // Obtener el chat para buscar participantes
    try {
      const chatObj = chat || await msg.getChat();
      logger.info(`[getTargetUser] Strategy 3: Got chat, isGroup=${chatObj?.isGroup}`);
      
      if (chatObj && chatObj.isGroup && chatObj.participants) {
        logger.info(`[getTargetUser] Strategy 3: Searching in ${chatObj.participants.length} participants`);
        
        // Buscar el participante que coincida con el LID mencionado
        for (const participant of chatObj.participants) {
          const participantId = participant.id?._serialized || participant.id;
          
          // Si el participante tiene el mismo LID que el mencionado
          if (participantId === mentionedLid) {
            // Intentar obtener el contacto completo
            try {
              const contact = await chatObj.client?.getContactById(participantId);
              if (contact) {
                logger.info(`[getTargetUser] Strategy 3: Found contact for LID - number=${contact.number}, pushname=${contact.pushname}`);
                
                // Si el contacto tiene número real
                if (contact.number) {
                  const phone = contact.number.replace(/\D/g, '');
                  if (phone.length >= 8 && phone.length <= 14) {
                    return {
                      contact: contact,
                      phone: phone,
                      name: contact.pushname || contact.name || phone,
                      jid: `${phone}@s.whatsapp.net`,
                      method: 'lid_resolved',
                      isLid: true
                    };
                  }
                }
              }
            } catch (contactErr) {
              logger.error(`[getTargetUser] Strategy 3: Error getting contact: ${contactErr.message}`);
            }
          }
        }
        
        // Si no encontramos el número, al menos devolver el LID para que el comando pueda trabajar con él
        // Esto permite que el bot use el LID directamente si está configurado para eso
        const lidNumber = mentionedLid.replace('@lid', '').replace('@s.whatsapp.net', '');
        logger.info(`[getTargetUser] Strategy 3: Returning LID as fallback: ${lidNumber}`);
        return {
          contact: null,
          phone: lidNumber,
          name: lidNumber,
          jid: mentionedLid,
          method: 'lid_direct',
          isLid: true
        };
      }
    } catch (chatErr) {
      logger.error(`[getTargetUser] Strategy 3: Error getting chat: ${chatErr.message}`);
      
      // Fallback: devolver el LID directamente
      const lidNumber = mentionedLid.replace('@lid', '').replace('@s.whatsapp.net', '');
      logger.info(`[getTargetUser] Strategy 3 fallback: Returning LID directly: ${lidNumber}`);
      return {
        contact: null,
        phone: lidNumber,
        name: lidNumber,
        jid: mentionedLid,
        method: 'lid_fallback',
        isLid: true
      };
    }
  }

  // ESTRATEGIA 4: Fallback - extraer del texto del mensaje (SOLO números válidos)
  logger.info(`[getTargetUser] Strategy 4: Trying text extraction`);
  const textMentions = extractMentions(msg);
  logger.info(`[getTargetUser] Strategy 4: extractMentions returned ${JSON.stringify(textMentions)}`);
  if (textMentions.length > 0) {
    const phone = textMentions[0];
    // Doble validación: el número debe ser válido (8-14 dígitos)
    // Números más largos son probablemente LIDs
    if (phone && phone.length >= 8 && phone.length <= 14 && /^\d+$/.test(phone)) {
      return {
        contact: null,
        phone: phone,
        name: phone,
        jid: `${phone}@s.whatsapp.net`,
        method: 'text',
        isLid: false
      };
    }
  }

  return null;
}

export default { 
  parseCommand, 
  extractMentions, 
  getFirstMention, 
  getMentionsAsync, 
  getFirstMentionAsync, 
  extractContactInfo,
  getTargetUser 
};

