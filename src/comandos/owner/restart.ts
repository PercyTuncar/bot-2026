import logger from '../../lib/logger.js';

export default {
  name: 'restart',
  description: 'Reiniciar el bot (owner)',
  usage: '.restart',
  category: 'owner',
  permissions: 'owner',
  scope: 'any',

  async execute({ msg }) {
    try {
      await msg.react('⏳');
      await msg.reply(
        ' *Reiniciando Bot...*\n\n' +
        'El bot se reiniciará en unos segundos.\n' +
        'Si usas PM2, se reiniciará automáticamente.\n\n' +
        ' Por favor espera...'
      );

      logger.info('[RESTART] Bot reiniciandose por comando del owner');

      setTimeout(() => {
        process.exit(0);
      }, 2000);
      await msg.react('✅');

    } catch (error) {
      logger.error('[RESTART] Error:', error);
      await msg.react('❌');
      await msg.reply(' Error al reiniciar el bot.');
    }
  }
};
