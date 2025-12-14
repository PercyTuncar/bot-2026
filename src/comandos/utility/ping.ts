﻿import logger from '../../lib/logger.js';
import { EMOJIS } from '../../config/constants.js';
import { bold, bulletList, joinSections, section } from '../../utils/message-builder.js';
import { reply } from '../../utils/reply.js';

export default {
  name: 'ping',
  description: 'Verificar latencia del bot',
  category: 'general',
  permissions: 'user',
  scope: 'any',
  cooldown: 5,
  enabled: true,

  async execute({ sock, isGroup, replyJid, msg }) {
    try {
      await msg.react(EMOJIS.LOADING);
      const start = Date.now();
      logger.info(`${EMOJIS.INFO} Ping ejecutado en ${isGroup ? 'grupo' : 'DM'}`);

      // Calcular latencia antes de enviar para responder en un solo mensaje
      // Usamos una operación ligera para forzar una ida/vuelta mínima
      try {
        await msg.getChat();
      } catch {}
      const latency = Date.now() - start;

      const header = `${EMOJIS.ROBOT} ${bold('PONG')}`;
      const body = bulletList([
        `${EMOJIS.SUCCESS} Bot funcionando correctamente`,
        `${EMOJIS.LOADING} Latencia: ${latency}ms`
      ]);
      await reply(sock, msg, joinSections([header, body]));
      await msg.react(EMOJIS.SUCCESS);

      logger.info(`${EMOJIS.SUCCESS} Ping respondido en ${latency}ms`);
    } catch (error) {
      logger.error(`${EMOJIS.ERROR} Error en ping: ${error.message}`);
      await msg.react(EMOJIS.ERROR);
      try {
        const targetJid = replyJid;
        const err = joinSections([`${EMOJIS.ERROR} ${bold('Error en PING')}`, bulletList(['Intenta nuevamente en unos segundos.'])]);
        await reply(sock, msg, err);
      } catch (sendError) {
        logger.error(`${EMOJIS.ERROR} Error al enviar mensaje: ${sendError.message}`);
      }
    }
  }
};

