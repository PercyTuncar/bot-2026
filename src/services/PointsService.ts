import PointsRepository from '../repositories/PointsRepository.js';
import MemberRepository from '../repositories/MemberRepository.js';
import GroupRepository from '../repositories/GroupRepository.js';
import { config } from '../config/environment.js';
import { normalizePhone } from '../utils/phone.js';
import { isValidMessageForPoints } from '../utils/validator.js';
import { calculateLevel, checkLevelUp } from '../utils/levels.js';
import logger from '../lib/logger.js';

// Rate limiting: tracking de últimos puntos y mensajes
const lastPointTime = new Map(); // phone -> timestamp
const messageTimestamps = new Map(); // phone -> array de timestamps

export class PointsService {

  /**
   * Procesa un mensaje para puntos
   * @param {string} groupId - ID del grupo
   * @param {object} msg - Mensaje de WhatsApp
   * @param {string} userPhone - Identificador del usuario (phone o LID) ya resuelto
   */
  static async processMessage(groupId, msg, userPhone = null) {
    if (!config.points.enabled) {
      return null;
    }

    // Validar que el mensaje cuenta para puntos
    if (!isValidMessageForPoints(msg, config.bot.prefix)) {
      return null;
    }

    const now = Date.now();

    try {
      // Usar userPhone pasado como parámetro (ya resuelto en event-handler)
      // userPhone puede ser phone o LID
      const userId = userPhone;

      if (!userId) {
        logger.warn(`PointsService: No se recibió userPhone`);
        return null;
      }

      // CRÍTICO: Buscar member para obtener el docId correcto (phone)
      // Si userId es LID, findByPhoneOrLid() retorna el member y su docId (phone)
      const isLid = userId.includes('@lid');
      const phoneForSearch = isLid ? null : userId;
      const lidForSearch = isLid ? userId : null;
      const found = await MemberRepository.findByPhoneOrLid(groupId, phoneForSearch, lidForSearch);
      if (!found || !found.data || !found.data.isMember) {
        logger.warn(`PointsService: Member not found for userId=${userId}`);
        return null;
      }

      // USAR EL DOCID (phone) para todas las operaciones de Firestore
      const phone = found.docId;
      const member = found.data;

      // Validación extra de seguridad anti-bucle (solo si phone es numérico)
      const remoteJid = msg.to || msg.from;
      const isGroup = remoteJid?.endsWith('@g.us');

      if (isGroup && !phone.includes('@lid')) {
        const rawGroupId = remoteJid.replace('@g.us', '');
        if (phone === rawGroupId) return null;
      }

      // Anti-flood: Si envía 5+ mensajes en 1 segundo, no cuentan
      const userMessages = messageTimestamps.get(phone) || [];
      const recentMessages = userMessages.filter(ts => now - ts < 1000);

      if (recentMessages.length >= 5) {
        logger.warn(`Anti-flood: ${phone} envió ${recentMessages.length} mensajes en 1 segundo, ignorando`);
        // Actualizar timestamps (mantener solo los últimos 10)
        messageTimestamps.set(phone, recentMessages.slice(-10));
        return null;
      }

      // Agregar timestamp actual
      recentMessages.push(now);
      messageTimestamps.set(phone, recentMessages.slice(-20)); // Mantener últimos 20

      // Rate limiting: Máximo 1 punto cada 10 segundos
      const lastPoint = lastPointTime.get(phone);
      const timeSinceLastPoint = lastPoint ? (now - lastPoint) : Infinity;

      // Obtener configuración del grupo para messagesPerPoint
      const groupConfig = await GroupRepository.getConfig(groupId);
      const group = await GroupRepository.getById(groupId);
      // Prioridad: groupConfig.messagesPerPoint > groupConfig.points?.perMessages > config global
      const messagesPerPoint = groupConfig?.messagesPerPoint
        || groupConfig?.points?.perMessages
        || group?.config?.messagesPerPoint
        || group?.config?.points?.perMessages
        || config.points.perMessages;

      // Usar messageCount global para consistencia
      const currentMessageCount = member.messageCount || 0;
      
      // Calcular progreso basado en messageCount
      // Si el residuo es 0, significa que alcanzó un múltiplo (ej. 10, 20, 30)
      // Aseguramos que currentMessageCount > 0 para evitar punto al inicio (0)
      const isPointMilestone = currentMessageCount > 0 && (currentMessageCount % messagesPerPoint === 0);

      // Verificar si alcanzó el límite para +1 punto
      if (isPointMilestone) {
        // Verificar rate limiting: solo dar punto si pasó 1 segundo desde el último
        // PERO el usuario pidió consistencia estricta, así que relajamos esto o solo logueamos
        if (timeSinceLastPoint < 1000) {
           logger.warn(`Rate limit warning: ${phone} ganó punto muy rápido, pero se otorga por consistencia.`);
        }

        // Agregar punto
        const pointStartTime = Date.now();
        await PointsRepository.addPoints(groupId, phone, 1);
        logger.info(`[${new Date().toISOString()}] [UPDATE] groups/${groupId}/members/${phone}.points +1 → SUCCESS (${Date.now() - pointStartTime}ms)`);

        // Ya no reseteamos messagesForNextPoint porque usamos messageCount global

        // Actualizar timestamp del último punto
        lastPointTime.set(phone, now);

        // Obtener puntos actualizados
        const foundUpdated = await MemberRepository.findByPhoneOrLid(groupId, phone, null);
        const updatedMember = foundUpdated ? foundUpdated.data : null;
        const newPoints = updatedMember?.points || 0;

        // VERIFICAR SUBIDA DE NIVEL
        const levels = groupConfig?.levels || (await GroupRepository.getById(groupId))?.config?.levels;

        const oldPoints = newPoints - 1; // Puntos antes de sumar
        const levelUpInfo = checkLevelUp(oldPoints, newPoints, levels);

        if (levelUpInfo && levelUpInfo.leveled) {
          // Actualizar currentLevel en base de datos
          await MemberRepository.update(groupId, phone, {
            currentLevel: levelUpInfo.newLevel.level
          });

          logger.info(`🎉 ${phone} subió al nivel ${levelUpInfo.newLevel.level} (${levelUpInfo.newLevel.name})`);
        }

        logger.info(`Punto agregado a ${phone} en grupo ${groupId}. Total: ${newPoints}`);

        // Obtener nombre de puntos personalizado
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
      } else {
        // No se ganó punto, solo retornamos el estado actual
        const progress = currentMessageCount % messagesPerPoint;
        return {
          pointsAdded: false,
          messagesForNextPoint: progress,
          messagesNeeded: messagesPerPoint - progress
        };
      }
    } catch (error) {
      logger.error(`Error al procesar puntos:`, error);
      return null;
    }
  }

  /**
   * Establece puntos de un usuario
   */
  static async setPoints(groupId, phone, points) {
    const startTime = Date.now();
    await PointsRepository.setPoints(groupId, phone, points);
    logger.info(`[${new Date().toISOString()}] [UPDATE] groups/${groupId}/members/${phone}.points SET to ${points} → SUCCESS (${Date.now() - startTime}ms)`);
  }

  /**
   * Resetea puntos de un usuario
   */
  static async resetPoints(groupId, phone) {
    const startTime = Date.now();
    await PointsRepository.resetPoints(groupId, phone);
    await PointsRepository.resetMessageCounter(groupId, phone);
    logger.info(`[${new Date().toISOString()}] [UPDATE] groups/${groupId}/members/${phone}.points RESET → SUCCESS (${Date.now() - startTime}ms)`);
  }
}

export default PointsService;
