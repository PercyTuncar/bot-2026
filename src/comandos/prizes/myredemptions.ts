import { getFirestore } from '../../config/firebase.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';

export default {
  name: 'myredemptions',
  description: 'Ver mis canjes pendientes y recientes',
  usage: '.myredemptions',
  category: 'prizes',
  permissions: 'member',
  scope: 'group',

  async execute({ msg, groupId, userPhone }) {
    try {
      const db = getFirestore();
      
      const snapshot = await db.collection('groups')
        .doc(groupId)
        .collection('redemptionRequests')
        .where('userId', '==', userPhone)
        .orderBy('requestedAt', 'desc')
        .limit(10)
        .get();

      if (snapshot.empty) {
        await msg.reply(EMOJIS.INFO + ' No tienes canjes registrados.');
        return;
      }

      let response = EMOJIS.GIFT + ' *Mis Canjes*\n\n';
      
      snapshot.docs.forEach((doc, index) => {
        const data = doc.data() as any;
        const status = data.status === 'pending' ? EMOJIS.WARNING + ' Pendiente'
          : data.status === 'approved' ? EMOJIS.SUCCESS + ' Aprobado'
          : data.status === 'delivered' ? EMOJIS.STAR + ' Entregado'
          : EMOJIS.ERROR + ' Rechazado';
        
        const date = new Date(data.requestedAt).toLocaleDateString('es-ES');
        
        response += (index + 1) + '. *' + data.prizeName + '*\n';
        response += '   ' + EMOJIS.POINTS + ' ' + data.pointsCost + ' pts | ' + status + '\n';
        response += '   ' + EMOJIS.CALENDAR + ' ' + date + '\n';
        if (data.status === 'rejected' && data.rejectionReason) {
          response += '   ' + EMOJIS.INFO + ' ' + data.rejectionReason + '\n';
        }
        response += '\n';
      });

      await msg.reply(response);
      logger.info('[MYREDEMPTIONS] Usuario ' + userPhone + ' consulto sus canjes');
    } catch (error) {
      logger.error('[MYREDEMPTIONS] Error:', error);
      await msg.reply(EMOJIS.ERROR + ' Error al obtener tus canjes.');
    }
  }
};
