import { getFirestore } from '../../config/firebase.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';

export default {
  name: 'rewards',
  description: 'Ver premios disponibles del grupo',
  usage: '.rewards',
  category: 'rewards',
  permissions: 'member',
  scope: 'group',

  async execute({ msg, groupId }) {
    try {
      const db = getFirestore();

      const snapshot = await db.collection('groups')
        .doc(groupId)
        .collection('prizes')
        .where('isActive', '==', true)
        .orderBy('cost', 'asc')
        .get();

      if (snapshot.empty) {
        await msg.reply(EMOJIS.INFO + ' No hay premios disponibles en este grupo.\n\nUsa *.addreward* para agregar premios.');
        return;
      }

      let response = EMOJIS.GIFT + ' *Premios Disponibles*\n\n';
      
      snapshot.docs.forEach((doc, index) => {
        const prize = doc.data();
        const stockText = prize.stock !== undefined && prize.stock !== null
          ? ' | Stock: ' + prize.stock
          : '';
        
        response += (index + 1) + '. *' + prize.name + '*\n';
        response += '   ' + EMOJIS.POINTS + ' Costo: ' + prize.cost + ' pts' + stockText + '\n';
        if (prize.description) {
          response += '   ' + EMOJIS.INFO + ' ' + prize.description + '\n';
        }
        response += '   ID: ' + doc.id + '\n\n';
      });

      response += '_Usa .redeem <id> para canjear un premio_';

      await msg.reply(response);
      logger.info('[REWARDS] ' + snapshot.docs.length + ' premios mostrados en grupo ' + groupId);
    } catch (error) {
      logger.error('[REWARDS] Error:', error);
      await msg.reply(EMOJIS.ERROR + ' Error al obtener premios.');
    }
  }
};
