import RequestService from '../../services/RequestService.js';
import { EMOJIS } from '../../config/constants.js';
import RequestRepository from '../../repositories/RequestRepository.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import { normalizePhone } from '../../utils/phone.js';
import logger from '../../lib/logger.js';

export default {
  name: 'approveprize',
  description: 'Aprobar solicitud de premio',
  category: 'admin',
  permissions: 'group_admin',
  scope: 'any',
  cooldown: 5,

  async execute({ sock, args, userPhone, replyJid }) {
    const requestId = args[0];
    if (!requestId) {
      await sock.sendMessage(replyJid, formatError('Debes especificar el ID de la solicitud'));
      return;
    }

    try {
      const request = await RequestRepository.getById(requestId);
      if (!request) {
        await sock.sendMessage(replyJid, formatError('Solicitud no encontrada'));
        return;
      }

      if (request.status !== 'pending') {
        await sock.sendMessage(replyJid, formatError(`La solicitud ya está ${request.status}`));
        return;
      }

      await RequestService.approveRequest(requestId, normalizePhone(userPhone), sock);

      // Auto-deliver (deduct points) immediately for now
      // In strict flows, this might be a separate step, but for digital items usually it's instant.
      await RequestService.deliverRequest(requestId, normalizePhone(userPhone), sock);

      await sock.sendMessage(replyJid, formatSuccess('Solicitud aprobada y procesada (Puntos descontados)'));
    } catch (error) {
      logger.error('Error al aprobar solicitud:', error);
      await sock.sendMessage(replyJid, formatError(error.message || 'Error al aprobar solicitud'));
    }
  }
};

