import PremiumHandler from '../../handlers/premiumHandler.js';
import logger from '../../lib/logger.js';
export default {
    name: 'deletepremiumcmd',
    description: 'Eliminar un comando premium (admin)',
    usage: '.deletepremiumcmd {commandId}',
    category: 'admin',
    permissions: 'admin',
    scope: 'group',
    async execute({ msg, args, groupId }) {
        const commandId = args[0];
        if (!commandId) {
            await msg.reply(' Debes proporcionar el ID del comando premium.\n\nUso: .deletepremiumcmd {commandId}');
            return;
        }
        try {
            const result = await PremiumHandler.deleteCommand(groupId, commandId);
            if (!result.success) {
                await msg.reply(' ' + result.message);
                return;
            }
            const response = ' *Comando Premium Eliminado*\n\n' +
                ' Nombre: ' + result.command.name + '\n' +
                ' Precio: ' + result.command.price + ' puntos\n' +
                ' ID: ' + commandId + '\n\n' +
                'El comando premium ha sido eliminado permanentemente.';
            await msg.reply(response);
            logger.info('[DELETEPREMIUMCMD] Comando ' + commandId + ' eliminado en grupo ' + groupId);
        }
        catch (error) {
            logger.error('[DELETEPREMIUMCMD] Error:', error);
            await msg.reply(' Error al eliminar el comando premium.');
        }
    }
};
