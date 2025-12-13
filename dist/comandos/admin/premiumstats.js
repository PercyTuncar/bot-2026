import { getFirestore } from '../../config/firebase.js';
import logger from '../../lib/logger.js';
export default {
    name: 'premiumstats',
    description: 'Estadisticas de comandos premium del grupo (admin)',
    usage: '.premiumstats',
    category: 'admin',
    permissions: 'admin',
    scope: 'group',
    async execute({ msg, groupId }) {
        try {
            const db = getFirestore();
            const commandsSnapshot = await db.collection('groups')
                .doc(groupId)
                .collection('premium_commands')
                .get();
            if (commandsSnapshot.empty) {
                await msg.reply(' No hay comandos premium creados en este grupo.');
                return;
            }
            const commands = commandsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const totalCommands = commands.length;
            const totalRevenue = commands.reduce((sum, cmd) => sum + (cmd.totalRevenue || 0), 0);
            const totalPurchases = commands.reduce((sum, cmd) => sum + (cmd.totalPurchases || 0), 0);
            const totalUsage = commands.reduce((sum, cmd) => sum + (cmd.totalUsage || 0), 0);
            const topPurchased = [...commands]
                .sort((a, b) => (b.totalPurchases || 0) - (a.totalPurchases || 0))
                .slice(0, 5);
            const topUsed = [...commands]
                .sort((a, b) => (b.totalUsage || 0) - (a.totalUsage || 0))
                .slice(0, 5);
            let response = ' *Estadisticas de Comandos Premium*\n\n' +
                ' Total de comandos: ' + totalCommands + '\n' +
                ' Ingresos totales: ' + totalRevenue + ' puntos\n' +
                ' Total de compras: ' + totalPurchases + '\n' +
                ' Total de usos: ' + totalUsage + '\n\n';
            if (topPurchased.length > 0) {
                response += ' *Top 5 Mas Comprados:*\n';
                topPurchased.forEach((cmd, index) => {
                    response += (index + 1) + '. ' + cmd.name + ' - ' + (cmd.totalPurchases || 0) + ' compras\n';
                });
                response += '\n';
            }
            if (topUsed.length > 0) {
                response += ' *Top 5 Mas Usados:*\n';
                topUsed.forEach((cmd, index) => {
                    response += (index + 1) + '. ' + cmd.name + ' - ' + (cmd.totalUsage || 0) + ' usos\n';
                });
            }
            await msg.reply(response);
            logger.info('[PREMIUMSTATS] Estadisticas consultadas en grupo ' + groupId);
        }
        catch (error) {
            logger.error('[PREMIUMSTATS] Error:', error);
            await msg.reply(' Error al obtener estadisticas de comandos premium.');
        }
    }
};
