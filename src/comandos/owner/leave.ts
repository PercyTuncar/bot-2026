import GroupRepository from '../../repositories/GroupRepository.js';
import logger from '../../lib/logger.js';

export default {
  name: 'leave',
  description: 'Salir de un grupo especifico (owner)',
  usage: '.leave {groupId}',
  category: 'owner',
  permissions: 'owner',
  scope: 'any',

  async execute({ sock, msg, args }) {
    const groupId = args[0];

    if (!groupId) {
      await msg.reply(' Debes proporcionar el ID del grupo.\n\nUso: .leave {groupId}\n\nUsa .listgroups para ver los IDs.');
      return;
    }

    try {
      const group = await GroupRepository.getById(groupId);
      
      if (!group) {
        await msg.reply(' No se encontro el grupo con ese ID.');
        return;
      }

      const groupJid = groupId + '@g.us';

      try {
        const farewellMsg = 
          ' *El bot se retira del grupo*\n\n' +
          'El administrador del bot ha solicitado mi salida.\n\n' +
          'Hasta pronto!';
        
        await sock.sendMessage(groupJid, farewellMsg);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        logger.warn('[LEAVE] No se pudo enviar mensaje de despedida:', err);
      }

      const chat = await sock.getChatById(groupJid);
      if (chat && chat.leave) {
        await chat.leave();
      }

      await GroupRepository.update(groupId, {
        isActive: false,
        leftAt: new Date().toISOString()
      });

      await msg.reply(
        ' *Bot retirado del grupo*\n\n' +
        ' Grupo: ' + group.name + '\n' +
        ' ID: ' + groupId + '\n\n' +
        'El bot ha salido del grupo y ha sido desactivado en la base de datos.'
      );

      logger.info('[LEAVE] Bot salio del grupo ' + groupId + ' (' + group.name + ')');
    } catch (error) {
      logger.error('[LEAVE] Error:', error);
      await msg.reply(' Error al salir del grupo. Verifica que el ID sea correcto.');
    }
  }
};
