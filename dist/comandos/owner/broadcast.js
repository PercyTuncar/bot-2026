import GroupRepository from '../../repositories/GroupRepository.js';
import logger from '../../lib/logger.js';
export default {
    name: 'broadcast',
    description: 'Enviar mensaje a todos los grupos activos (owner)',
    usage: '.broadcast {mensaje}',
    category: 'owner',
    permissions: 'owner',
    scope: 'any',
    async execute({ sock, msg, args }) {
        const message = args.join(' ');
        if (!message) {
            await msg.reply(' Debes proporcionar un mensaje.\n\nUso: .broadcast {mensaje}');
            return;
        }
        try {
            const groups = await GroupRepository.getAll();
            const activeGroups = groups.filter(g => g.isActive);
            if (activeGroups.length === 0) {
                await msg.reply(' No hay grupos activos.');
                return;
            }
            await msg.reply(' Enviando mensaje a ' + activeGroups.length + ' grupos activos...');
            let successCount = 0;
            let failCount = 0;
            for (const group of activeGroups) {
                try {
                    const groupJid = group.id + '@g.us';
                    const broadcastMsg = ' *Mensaje del Bot Owner*\n\n' +
                        message + '\n\n' +
                        '_Mensaje enviado a todos los grupos activos_';
                    await sock.sendMessage(groupJid, broadcastMsg);
                    successCount++;
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                catch (err) {
                    logger.error('[BROADCAST] Error al enviar a grupo ' + group.id + ':', err);
                    failCount++;
                }
            }
            const resultMsg = ' *Broadcast Completado*\n\n' +
                ' Enviados: ' + successCount + '\n' +
                ' Fallidos: ' + failCount + '\n' +
                ' Total: ' + activeGroups.length;
            await msg.reply(resultMsg);
            logger.info('[BROADCAST] Mensaje enviado a ' + successCount + '/' + activeGroups.length + ' grupos');
        }
        catch (error) {
            logger.error('[BROADCAST] Error:', error);
            await msg.reply(' Error al enviar broadcast.');
        }
    }
};
