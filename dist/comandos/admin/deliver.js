import { getFirestore } from '../../config/firebase.js';
import { EMOJIS } from '../../config/constants.js';
import logger from '../../lib/logger.js';
export default {
    name: 'deliver',
    description: 'Marcar premio como entregado (admin)',
    usage: '.deliver <id>',
    category: 'admin',
    permissions: 'admin',
    scope: 'group',
    async execute({ msg, args, groupId }) {
        if (args.length === 0) {
            await msg.reply(EMOJIS.INFO + ' *Uso:* .deliver <id>');
            return;
        }
        const requestId = args[0];
        try {
            const db = getFirestore();
            const requestRef = db.collection('groups')
                .doc(groupId)
                .collection('redemptionRequests')
                .doc(requestId);
            const requestDoc = await requestRef.get();
            if (!requestDoc.exists) {
                await msg.reply(EMOJIS.ERROR + ' Solicitud no encontrada.');
                return;
            }
            const requestData = requestDoc.data();
            if (requestData.status === 'delivered') {
                await msg.reply(EMOJIS.WARNING + ' Este premio ya fue marcado como entregado.');
                return;
            }
            if (requestData.status !== 'approved' && requestData.status !== 'pending') {
                await msg.reply(EMOJIS.ERROR + ' Solo se pueden entregar premios aprobados o pendientes.');
                return;
            }
            await requestRef.update({
                status: 'delivered',
                deliveredAt: new Date().toISOString(),
                deliveredBy: msg.author || msg.from.split('@')[0]
            });
            await msg.reply(EMOJIS.SUCCESS + ' Premio marcado como entregado!\n\n' +
                EMOJIS.GIFT + ' Premio: ' + requestData.prizeName + '\n' +
                EMOJIS.USER + ' Usuario: @' + requestData.userId);
            logger.info('[DELIVER] Premio ' + requestId + ' entregado en grupo ' + groupId);
        }
        catch (error) {
            logger.error('[DELIVER] Error:', error);
            await msg.reply(EMOJIS.ERROR + ' Error al marcar como entregado.');
        }
    }
};
