import { getFirestore } from '../../config/firebase.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';

export default {
  name: 'deletereward',
  description: 'Eliminar un premio (admin)',
  usage: '.deletereward <id>',
  category: 'admin',
  permissions: 'admin',
  scope: 'group',

  async execute({ msg, args, groupId }) {
    if (args.length === 0) {
      await msg.reply(EMOJIS.INFO + ' *Uso:* .deletereward <id>');
      return;
    }

    const prizeId = args[0];

    try {
      const db = getFirestore();
      
      const prizeRef = db.collection('groups')
        .doc(groupId)
        .collection('prizes')
        .doc(prizeId);
      
      const prizeDoc = await prizeRef.get();

      if (!prizeDoc.exists) {
        await msg.reply(EMOJIS.ERROR + ' Premio no encontrado.');
        return;
      }

      const prizeData = prizeDoc.data() as any;
      
      await prizeRef.delete();

      await msg.reply(EMOJIS.SUCCESS + ' Premio eliminado correctamente!\n\n' +
        EMOJIS.GIFT + ' Nombre: ' + prizeData.name + '\n' +
        EMOJIS.POINTS + ' Costo: ' + prizeData.cost + ' pts');
      
      logger.info('[DELETEREWARD] Premio ' + prizeId + ' eliminado de grupo ' + groupId);
    } catch (error) {
      logger.error('[DELETEREWARD] Error:', error);
      await msg.reply(EMOJIS.ERROR + ' Error al eliminar el premio.');
    }
  }
};
