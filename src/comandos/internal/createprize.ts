import PrizeService from '../../services/PrizeService.js';
import { EMOJIS } from '../../config/constants.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import { isValidPrizeCode } from '../../utils/validator.js';

export default {
  name: 'createprize',
  description: 'Crear premio desde comando',
  category: 'internal',
  permissions: 'global_admin',
  scope: 'any',
  cooldown: 5,

  async execute({  sock, msg, args, groupId, isGroup, replyJid }) {
    let targetGroupId = groupId;
    let code, name, points, description;

    // Si no es grupo, necesitamos el groupId como primer argumento
    if (!isGroup) {
      if (args.length < 5) {
        await sock.sendMessage(replyJid, 
          formatError('En chat privado debes especificar el groupId:\n' +
          '.createprize [groupId] [cÃ³digo] [nombre] [puntos] [descripciÃ³n]\n\n' +
          'Ejemplo: .createprize 123456789@g.us BEER10K "Cerveza Gratis" 10000 "Una cerveza en la prÃ³xima reuniÃ³n"')
        );
        return;
      }
      targetGroupId = args[0];
      code = args[1].toUpperCase();
      name = args[2];
      points = parseInt(args[3]);
      description = args.slice(4).join(' ');
    } else {
      // Si es grupo, validar que tenga al menos 4 argumentos
      if (args.length < 4) {
        await sock.sendMessage(replyJid, 
          formatError('Uso: .createprize [cÃ³digo] [nombre] [puntos] [descripciÃ³n]\n\n' +
          'Ejemplo: .createprize BEER10K "Cerveza Gratis" 10000 "Una cerveza en la prÃ³xima reuniÃ³n"')
        );
        return;
      }
      code = args[0].toUpperCase();
      name = args[1];
      points = parseInt(args[2]);
      description = args.slice(3).join(' ');
    }

    // Validaciones
    if (!isValidPrizeCode(code)) {
      await sock.sendMessage(replyJid, formatError('CÃ³digo invÃ¡lido. Debe contener solo letras mayÃºsculas, nÃºmeros y guiones bajos'));
      return;
    }

    if (isNaN(points) || points < 1) {
      await sock.sendMessage(replyJid, formatError('Los puntos deben ser un nÃºmero mayor a 0'));
      return;
    }

    try {
      const prize = await PrizeService.createPrize(targetGroupId, {
        code,
        name,
        description,
        pointsRequired: points,
        quantity: -1, // Ilimitado por defecto
        isActive: true
      });

      await sock.sendMessage(replyJid, 
        formatSuccess(`Premio creado exitosamente\n\n` +
        `CÃ³digo: ${prize.code}\n` +
        `Nombre: ${prize.name}\n` +
        `Puntos requeridos: ${prize.pointsRequired}\n` +
        `${!isGroup ? `Grupo: ${targetGroupId}\n` : ''}`)
      );
    } catch (error) {
      await sock.sendMessage(replyJid, formatError(error.message || 'Error al crear premio'));
    }
  }
};


