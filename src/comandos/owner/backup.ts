﻿import { getFirestore } from '../../config/firebase.js';
import logger from '../../lib/logger.js';

export default {
  name: 'backup',
  description: 'Realizar backup de la base de datos (owner)',
  usage: '.backup',
  category: 'owner',
  permissions: 'owner',
  scope: 'any',

  async execute({ msg }) {
    try {
      await msg.react('⏳');
      await msg.reply(
        '📦 *Generando Backup...*\n' +
        ' Este proceso puede tardar varios minutos...\n\n' +
        '_Nota: Para backups automaticos, configura Firestore export en Google Cloud_'
      );

      const db = getFirestore();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      const stats = {
        timestamp,
        collections: []
      };

      const groupsSnapshot = await db.collection('groups').get();
      stats.collections.push({
        name: 'groups',
        count: groupsSnapshot.size
      });

      const configSnapshot = await db.collection('bot_config').get();
      stats.collections.push({
        name: 'bot_config',
        count: configSnapshot.size
      });

      const purchasesSnapshot = await db.collection('premium_commands_purchases').get();
      stats.collections.push({
        name: 'premium_commands_purchases',
        count: purchasesSnapshot.size
      });

      let response = 
        ' *Estadisticas de Base de Datos*\n\n' +
        ' Fecha: ' + new Date().toLocaleString('es-ES') + '\n\n' +
        ' *Colecciones:*\n';

      stats.collections.forEach(col => {
        response += ' ' + col.name + ': ' + col.count + ' documentos\n';
      });

      response += 
        '\n *Nota Importante:*\n' +
        'Para realizar un backup completo, usa:\n' +
        'gcloud firestore export gs://[BUCKET_NAME]\n\n' +
        'O configura backups automaticos en Firebase Console.';

      await msg.reply(response);
      await msg.react('✅');
      logger.info('[BACKUP] Estadisticas generadas: ' + JSON.stringify(stats));

    } catch (error) {
      logger.error('[BACKUP] Error:', error);
      await msg.react('❌');
      await msg.reply(' Error al generar backup. Verifica los permisos de Firebase Admin SDK.');
    }
  }
};
