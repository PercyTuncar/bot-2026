import RequestService from '../../services/RequestService.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatDate } from '../../utils/formatter.js';
import { REQUEST_STATUS, EMOJIS } from '../../config/constants.js';

export default {
  name: 'myrequests',
  description: 'Ver tus solicitudes de premios',
  category: 'prizes',
  permissions: 'user',
  scope: 'group',
  cooldown: 10,

  async execute({  sock, msg, userPhone, replyJid }) {
    // userPhone ya viene como userId válido (phone o LID) desde command-dispatcher
    const requests = await RequestService.getUserRequests(userPhone);

    if (requests.length === 0) {
      await sock.sendMessage(replyJid, 'ðŸ“‹ No tienes solicitudes de premios');
      return;
    }

    let response = 'ðŸ“‹ TUS SOLICITUDES DE PREMIOS\n\n';

    requests.forEach((req, i) => {
      const statusEmoji = {
        [REQUEST_STATUS.PENDING]: 'â³',
        [REQUEST_STATUS.APPROVED]: 'âœ…',
        [REQUEST_STATUS.DELIVERED]: 'ðŸŽ‰',
        [REQUEST_STATUS.REJECTED]: 'âŒ'
      };

      response += `${i + 1}. ${statusEmoji[req.status] || 'ðŸ“‹'} ${req.prizeName}\n`;
      response += `   CÃ³digo: ${req.prizeCode}\n`;
      response += `   Estado: ${req.status}\n`;
      response += `   Puntos: ${req.pointsSpent}\n`;
      response += `   Fecha: ${formatDate(req.requestedAt)}\n`;
      
      if (req.status === REQUEST_STATUS.REJECTED && req.rejectionReason) {
        response += `   Motivo rechazo: ${req.rejectionReason}\n`;
      }
      
      response += '\n';
    });

    await sock.sendMessage(replyJid, response);
  }
};


