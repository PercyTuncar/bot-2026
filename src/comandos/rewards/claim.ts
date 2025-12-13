﻿﻿import PrizeService from '../../services/PrizeService.js';
import { EMOJIS } from '../../config/constants.js';
import ConfigRepository from '../../repositories/ConfigRepository.js';
import GroupRepository from '../../repositories/GroupRepository.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';
import { extractParticipants } from '../../utils/group.js';

export default {
  name: 'claim',
  description: 'Reclamar un premio',
  category: 'prizes',
  permissions: 'user',
  scope: 'group',
  cooldown: 10,

  async execute({ sock, msg, args, groupId, groupJid, userPhone, replyJid }) {
    const code = args[0]?.toUpperCase();
    if (!code) {
      await sock.sendMessage(replyJid, formatError('Debes especificar el cÃ³digo del premio'));
      return;
    }

    try {
      const request = await PrizeService.claimPrize(
        groupId,
        userPhone,
        code,
        msg.pushName || userPhone
      );

      const group = await GroupRepository.getById(groupId);
      const userName = msg.pushName || userPhone;

      // Notificar al usuario
      // PrizeService.claimPrize devuelve RedemptionData, por lo que usamos rewardName en lugar de prizeName
      // y pointsCost en lugar de pointsSpent para ser consistente con RedemptionHandler
      const requestAny = request as any;
      const rewardName = requestAny.rewardName || requestAny.prizeName || 'Premio';
      const pointsCost = requestAny.pointsCost || requestAny.pointsSpent || 0;
      const prizeCode = requestAny.rewardId || requestAny.prizeCode || '';

      await sock.sendMessage(replyJid,
        formatSuccess(`Solicitud de premio creada\n\n`) +
        `Premio: ${rewardName}\n` +
        `ID de solicitud: ${request.id}\n` +
        `Estado: Pendiente\n\n` +
        `Un administrador revisará tu solicitud pronto.`
      );

      // Notificar a los admins
      try {
        const globalConfig = await ConfigRepository.getGlobal();
        const adminPhones = globalConfig?.adminPhones || [];
        const ownerPhone = globalConfig?.ownerPhone;

        // Obtener admins del grupo
        const targetJid = groupJid || (groupId.includes('@') ? groupId : `${groupId}@g.us`);
        const chat = await sock.getChatById(targetJid);
        if (!chat || !chat.isGroup) {
          throw new Error('Not a group');
        }
        const groupAdmins = extractParticipants(chat)
          .filter(p => p?.isAdmin || p?.isSuperAdmin || p?.admin)
          .map(p => normalizePhone(p?.id?._serialized || p?.id));

        // Lista única de admins a notificar (owner + global admins + group admins)
        const adminsToNotify = new Set();
        if (ownerPhone) adminsToNotify.add(ownerPhone);
        adminPhones.forEach(phone => adminsToNotify.add(normalizePhone(phone)));
        groupAdmins.forEach(phone => adminsToNotify.add(normalizePhone(phone)));

        const notificationMessage = 
          `🔔 *Nueva Solicitud de Premio*\n\n` +
          `Usuario: ${userName}\n` +
          `Teléfono: ${userPhone}\n` +
          `Grupo: ${group?.name || groupId}\n` +
          `Premio: ${rewardName} (${prizeCode})\n` +
          `Puntos requeridos: ${pointsCost}\n` +
          `ID de solicitud: ${request.id}\n\n` +
          `Usa .approveprize ${request.id} para aprobar\n` +
          `O revisa en el dashboard.`;

        // Enviar notificación a cada admin
        for (const adminPhone of adminsToNotify) {
          try {
            await sock.sendMessage(adminPhone + '@s.whatsapp.net', notificationMessage);
          } catch (error) {
            logger.warn(`No se pudo notificar al admin ${adminPhone}:`, error);
          }
        }

        logger.info(`Notificación de premio enviada a ${adminsToNotify.size} admins`);
      } catch (error) {
        logger.error('Error al notificar admins:', error);
        // No fallar el comando si falla la notificación
      }
    } catch (error) {
      await sock.sendMessage(replyJid, formatError(error.message || 'Error al reclamar premio'));
    }
  }
};


