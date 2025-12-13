
import { getTargetUser } from '../../utils/parser.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatSuccess, formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';

export default {
  name: 'mute',
  description: 'Silenciar a un usuario en el grupo (solo admins)',
  category: 'moderation',
  permissions: 'group_admin',
  scope: 'group',
  cooldown: 5,

  async execute({ sock, msg, args, replyJid }) {
    // 1. Obtener chat
    let chat = null;
    try {
      chat = await msg.getChat();
    } catch (e) {
      logger.warn(`[MUTE] Could not get chat: ${e.message}`);
    }

    // 2. Resolver usuario objetivo (soporte LID)
    const target = await getTargetUser(msg, chat);
    
    if (!target) {
      await sock.sendMessage(replyJid, formatError('Debes mencionar a un usuario para silenciar'));
      return;
    }

    // 3. Ejecutar acción usando JID correcto (LID o Phone)
    // En whatsapp-web.js, mute suele ser a nivel de chat, no de usuario individual en grupos estándar.
    // Sin embargo, si nos referimos a "ignorar" al usuario, eso es interno del bot.
    // Si nos referimos a mutear el chat entero, es diferente.
    // Asumiendo que se refiere a mutear al usuario (bot ignore):
    
    // TODO: Implementar lógica de "ignore user" en ModerationService si ese es el objetivo.
    // Por ahora, enviaremos un mensaje de "no implementado" o implementaremos la lógica de ignore.
    
    await sock.sendMessage(replyJid, formatError('Comando mute en desarrollo (requiere definir si es mute de bot o de grupo)'));
  }
};
