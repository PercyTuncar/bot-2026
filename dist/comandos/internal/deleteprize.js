import PrizeRepository from '../../repositories/PrizeRepository.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
export default {
    name: 'deleteprize',
    description: 'Eliminar o desactivar premio',
    category: 'internal',
    permissions: 'global_admin',
    scope: 'any',
    cooldown: 5,
    async execute({ sock, msg, args, groupId, isGroup, replyJid }) {
        if (args.length < 1) {
            await sock.sendMessage(replyJid, formatError('Uso: .deleteprize [cÃ³digo]\n' +
                'O en chat privado: .deleteprize [groupId] [cÃ³digo]'));
            return;
        }
        let targetGroupId = groupId;
        let code = args[0].toUpperCase();
        if (!isGroup) {
            if (args.length < 2) {
                await sock.sendMessage(replyJid, formatError('En chat privado debes especificar el groupId:\n' +
                    '.deleteprize [groupId] [cÃ³digo]'));
                return;
            }
            targetGroupId = args[0];
            code = args[1].toUpperCase();
        }
        try {
            const prize = await PrizeRepository.getByCode(targetGroupId, code);
            if (!prize) {
                await sock.sendMessage(replyJid, formatError('Premio no encontrado'));
                return;
            }
            await PrizeRepository.update(targetGroupId, prize.id, {
                isActive: false
            });
            await sock.sendMessage(replyJid, formatSuccess(`Premio desactivado\n\n` +
                `CÃ³digo: ${prize.code}\n` +
                `Nombre: ${prize.name}\n` +
                `Grupo: ${targetGroupId}`));
        }
        catch (error) {
            await sock.sendMessage(replyJid, formatError('Error al eliminar premio'));
        }
    }
};
