﻿import { getFirestore } from '../../config/firebase.js';
import { EMOJIS } from '../../config/constants.js';
import { normalizePhone } from '../../utils/phone.js';
import logger from '../../lib/logger.js';
import { reply } from '../../utils/reply.js';

export default {
  name: 'myredemptions',
  description: 'Ver mis solicitudes de canje',
  usage: '.myredemptions [estado]',
  category: 'rewards',
  permissions: 'user',
  scope: 'group',

  async execute({ sock, msg, args, groupId, userPhone, replyJid, member }) {
    const statusFilter = args[0]?.toLowerCase();

    const validStatuses = ['pending', 'approved', 'delivered', 'rejected'];
    
    if (statusFilter && !validStatuses.includes(statusFilter)) {
      await reply(
        sock,
        msg,
        EMOJIS.ERROR + ' Estado invalido.\\n\\n' +
        'Estados validos:\\n' +
        '  pending - Pendientes\\n' +
        '  approved - Aprobados\\n' +
        '  delivered - Entregados\\n' +
        '  rejected - Rechazados\\n\\n' +
        'Uso: .myredemptions [estado]'
      );
      return;
    }

    try {
      const db = getFirestore();
      
      // Usar teléfono canónico para la consulta
      const canonicalPhone = member ? (member.phone || member.id) : userPhone;
      
      let query = db.collection('groups')
        .doc(groupId)
        .collection('redemptions')
        .where('userPhone', '==', canonicalPhone)
        .orderBy('requestedAt', 'desc');

      if (statusFilter) {
        query = query.where('status', '==', statusFilter);
      }

      const snapshot = await query.get();

      if (snapshot.empty) {
        const statusMsg = statusFilter ? ' con estado "' + statusFilter + '"' : '';
        await reply(sock, msg, EMOJIS.ERROR + ' No tienes solicitudes de canje' + statusMsg + '.');
        return;
      }

      const redemptions = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));

      let response = EMOJIS.GIFT + ' *Mis Solicitudes de Canje*\n\n';
      
      if (statusFilter) {
        response += EMOJIS.CHART + ' Filtrado por: ' + statusFilter + '\n\n';
      }

      const formatDate = (date: any) => {
        if (!date) return 'N/A';
        const d = date.toDate ? date.toDate() : new Date(date);
        return d.toLocaleDateString('es-ES');
      };

      redemptions.forEach((redemption: any, index) => {
        const statusEmoji = {
          pending: EMOJIS.LOADING,
          approved: EMOJIS.SUCCESS,
          delivered: EMOJIS.PARTY,
          rejected: EMOJIS.ERROR
        };
        const emoji = statusEmoji[redemption.status] || EMOJIS.INFO;

        response += (index + 1) + '. ' + emoji + ' *' + redemption.rewardName + '*\n';
        response += '   ' + EMOJIS.CALENDAR + ' Solicitado: ' + formatDate(redemption.requestedAt) + '\n';
        response += '   ' + EMOJIS.POINTS + ' Puntos: ' + redemption.pointsCost + '\n';
        response += '   ' + EMOJIS.CHART + ' Estado: ' + redemption.status + '\n';
        
        if (redemption.status === 'rejected' && redemption.rejectReason) {
          response += '   ' + EMOJIS.MESSAGE + ' Razon: ' + redemption.rejectReason + '\n';
        }
        
        if (redemption.status === 'delivered' && redemption.deliveredAt) {
          response += '   ' + EMOJIS.PARTY + ' Entregado: ' + formatDate(redemption.deliveredAt) + '\n';
        }
        
        response += '\n';
      });

      await reply(sock, msg, response);
      logger.info('[MYREDEMPTIONS] Usuario ' + userPhone + ' consulto sus canjes en grupo ' + groupId);
    } catch (error) {
      logger.error('[MYREDEMPTIONS] Error:', error);
      await reply(sock, msg, EMOJIS.ERROR + ' Error al obtener tus solicitudes de canje.');
    }
  }
};
