import { getFirestore } from '../../config/firebase.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';

export default {
  name: 'editreward',
  description: 'Editar un premio existente (admin)',
  usage: '.editreward <id> <campo> <valor>',
  category: 'admin',
  permissions: 'admin',
  scope: 'group',

  async execute({ msg, args, groupId }) {
    if (args.length < 3) {
      await msg.reply(EMOJIS.INFO + ' *Uso:* .editreward <id> <campo> <valor>\n\n' +
        '*Campos disponibles:*\n' +
        '- name: Nombre del premio\n' +
        '- cost: Costo en puntos\n' +
        '- description: Descripcion\n' +
        '- stock: Cantidad disponible');
      return;
    }

    const prizeId = args[0];
    const field = args[1].toLowerCase();
    const value = args.slice(2).join(' ');

    const validFields = ['name', 'cost', 'description', 'stock'];
    if (!validFields.includes(field)) {
      await msg.reply(EMOJIS.ERROR + ' Campo invalido. Usa: ' + validFields.join(', '));
      return;
    }

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

      let updateValue: any = value;
      if (field === 'cost' || field === 'stock') {
        updateValue = parseInt(value);
        if (isNaN(updateValue) || updateValue < 0) {
          await msg.reply(EMOJIS.ERROR + ' El valor debe ser un numero positivo.');
          return;
        }
      }

      const updateData = {
        [field]: updateValue,
        updatedAt: new Date().toISOString()
      };

      await prizeRef.update(updateData);

      await msg.reply(EMOJIS.SUCCESS + ' Premio actualizado!\n\n' +
        EMOJIS.MESSAGE + ' Campo: ' + field + '\n' +
        EMOJIS.INFO + ' Nuevo valor: ' + updateValue);
      
      logger.info('[EDITREWARD] Premio ' + prizeId + ' actualizado en grupo ' + groupId);
    } catch (error) {
      logger.error('[EDITREWARD] Error:', error);
      await msg.reply(EMOJIS.ERROR + ' Error al editar el premio.');
    }
  }
};
