import { getFirestore } from '../../config/firebase.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';

export default {
  name: 'inactive',
  description: 'Usuarios inactivos (sin mensajes en X dias) (admin)',
  usage: '.inactive [dias]',
  category: 'admin',
  permissions: 'admin',
  scope: 'group',

  async execute({ msg, args, groupId }) {
    const days = parseInt(args[0]) || 7;

    if (days < 1 || days > 365) {
      await msg.reply(EMOJIS.ERROR + ' Los dias deben estar entre 1 y 365.');
      return;
    }

    try {
      const db = getFirestore();
      
      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() - days);
      const limitTimestamp = limitDate.toISOString();

      const snapshot = await db.collection('groups')
        .doc(groupId)
        .collection('members')
        .where('isMember', '==', true)
        .get();

      if (snapshot.empty) {
        await msg.reply(EMOJIS.ERROR + ' No hay miembros en el grupo.');
        return;
      }

      const members = snapshot.docs.map(doc => doc.data());
      
      const inactiveMembers = members.filter(member => {
        if (!member.lastMessageAt) return true;
        return member.lastMessageAt < limitTimestamp;
      });

      if (inactiveMembers.length === 0) {
        await msg.reply(EMOJIS.SUCCESS + ' No hay usuarios inactivos en los ultimos ' + days + ' dias.');
        return;
      }

      inactiveMembers.sort((a, b) => {
        const dateA = a.lastMessageAt || '1970-01-01';
        const dateB = b.lastMessageAt || '1970-01-01';
        return dateA.localeCompare(dateB);
      });

      let response = EMOJIS.SAD + ' *Usuarios Inactivos (' + days + '+ dias)*\n\n';
      response += EMOJIS.CHART + ' Total: ' + inactiveMembers.length + ' de ' + members.length + '\n\n';

      const displayLimit = Math.min(inactiveMembers.length, 20);
      
      for (let i = 0; i < displayLimit; i++) {
        const member = inactiveMembers[i];
        const name = member.displayName || member.pushname || member.phone;
        const lastMsg = member.lastMessageAt 
          ? new Date(member.lastMessageAt).toLocaleDateString('es-ES')
          : 'Nunca';
        
        response += (i + 1) + '. ' + name + '\n';
        response += '   ' + EMOJIS.CALENDAR + ' Ultimo mensaje: ' + lastMsg + '\n\n';
      }

      if (inactiveMembers.length > displayLimit) {
        response += '\n_...y ' + (inactiveMembers.length - displayLimit) + ' mas_';
      }

      await msg.reply(response);
      logger.info('[INACTIVE] ' + inactiveMembers.length + ' usuarios inactivos encontrados en grupo ' + groupId);
    } catch (error) {
      logger.error('[INACTIVE] Error:', error);
      await msg.reply(EMOJIS.ERROR + ' Error al obtener usuarios inactivos.');
    }
  }
};
