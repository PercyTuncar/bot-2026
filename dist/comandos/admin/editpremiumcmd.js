import PremiumHandler from '../../handlers/premiumHandler.js';
import logger from '../../lib/logger.js';
export default {
    name: 'editpremiumcmd',
    description: 'Editar un comando premium existente (admin)',
    usage: '.editpremiumcmd {commandId} {campo} {valor}',
    category: 'admin',
    permissions: 'admin',
    scope: 'group',
    async execute({ msg, args, groupId }) {
        const commandId = args[0];
        const field = args[1];
        const value = args.slice(2).join(' ');
        if (!commandId || !field || !value) {
            await msg.reply(' Uso incorrecto.\n\n' +
                'Uso: .editpremiumcmd {commandId} {campo} {valor}\n\n' +
                'Campos disponibles:\n' +
                ' name - Nombre del comando\n' +
                ' description - Descripcion\n' +
                ' price - Precio en puntos\n' +
                ' category - Categoria');
            return;
        }
        const validFields = ['name', 'description', 'price', 'category'];
        if (!validFields.includes(field)) {
            await msg.reply(' Campo invalido. Campos validos: name, description, price, category');
            return;
        }
        try {
            const result = await PremiumHandler.updateCommand(groupId, commandId, field, value);
            if (!result.success) {
                await msg.reply(' ' + result.message);
                return;
            }
            const response = ' *Comando Premium Actualizado*\n\n' +
                ' ID: ' + commandId + '\n' +
                ' Campo: ' + field + '\n' +
                ' Nuevo valor: ' + value + '\n\n' +
                'El comando premium ha sido actualizado exitosamente.';
            await msg.reply(response);
            logger.info('[EDITPREMIUMCMD] Comando ' + commandId + ' actualizado en grupo ' + groupId + ': ' + field + '=' + value);
        }
        catch (error) {
            logger.error('[EDITPREMIUMCMD] Error:', error);
            await msg.reply(' Error al editar el comando premium.');
        }
    }
};
