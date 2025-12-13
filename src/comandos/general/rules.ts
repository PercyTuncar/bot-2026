import { getFirestore } from '../../config/firebase.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';

export default {
  name: 'rules',
  description: 'Ver las reglas del grupo',
  usage: '.rules',
  category: 'general',
  permissions: 'member',
  scope: 'group',

  async execute({ msg, groupId }) {
    try {
      const db = getFirestore();
      const groupDoc = await db.collection('groups').doc(groupId).get();

      if (!groupDoc.exists) {
        await msg.reply(EMOJIS.ERROR + ' Grupo no registrado.');
        return;
      }

      const groupData = groupDoc.data() as any;
      const rules = groupData?.rules;

      if (!rules || rules.length === 0) {
        await msg.reply(EMOJIS.INFO + ' Este grupo no tiene reglas configuradas.\n\nUsa *.setrules* para configurarlas.');
        return;
      }

      let response = ' *Reglas del Grupo*\n\n';
      
      if (Array.isArray(rules)) {
        rules.forEach((rule, index) => {
          response += (index + 1) + '. ' + rule + '\n\n';
        });
      } else {
        response += rules;
      }

      response += '\n' + EMOJIS.WARNING + ' _El incumplimiento puede resultar en advertencias o expulsion._';

      await msg.reply(response);
      logger.info('[RULES] Reglas mostradas en grupo ' + groupId);
    } catch (error) {
      logger.error('[RULES] Error:', error);
      await msg.reply(EMOJIS.ERROR + ' Error al obtener las reglas.');
    }
  }
};
