import { getFirestore } from '../../config/firebase.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';

export default {
  name: 'rejectredeem',
  description: 'Rechazar canje de premio (admin)',
  usage: '.rejectredeem <id> [razon]',
  category: 'admin',
  permissions: 'admin',
  scope: 'group',

  async execute({ msg, args, groupId }) {
    if (args.length === 0) {
      await msg.reply(EMOJIS.INFO + ' *Uso:* .rejectredeem <id> [razon]');
      return;
    }

    const requestId = args[0];
    const reason = args.slice(1).join(' ') || 'Sin razon especificada';

    try {
      const db = getFirestore();
      
      const requestRef = db.collection('groups')
        .doc(groupId)
        .collection('redemptionRequests')
        .doc(requestId);
      
      const requestDoc = await requestRef.get();

      if (!requestDoc.exists) {
        await msg.reply(EMOJIS.ERROR + ' Solicitud no encontrada.');
        return;
      }

      const requestData = requestDoc.data() as any;
      
      if (requestData.status !== 'pending') {
        await msg.reply(EMOJIS.WARNING + ' Esta solicitud ya fue procesada.');
        return;
      }

      await requestRef.update({
        status: 'rejected',
        rejectedAt: new Date().toISOString(),
        rejectionReason: reason,
        rejectedBy: msg.author || msg.from.split('@')[0]
      });

      await msg.reply(EMOJIS.SUCCESS + ' Solicitud rechazada correctamente.\n\n' +
        EMOJIS.GIFT + ' Premio: ' + requestData.prizeName + '\n' +
        EMOJIS.POINTS + ' Costo: ' + requestData.pointsCost + '\n' +
        EMOJIS.INFO + ' Razon: ' + reason);
      
      logger.info('[REJECTREDEEM] Solicitud ' + requestId + ' rechazada en grupo ' + groupId);
    } catch (error) {
      logger.error('[REJECTREDEEM] Error:', error);
      await msg.reply(EMOJIS.ERROR + ' Error al rechazar la solicitud.');
    }
  }
};
