import { getFirestore } from '../../config/firebase.js';
import { normalizeGroupId } from '../../utils/phone.js';
import { getNow } from '../../utils/time.js';
import { formatError } from '../../utils/formatter.js';
import logger from '../../lib/logger.js';
import { EMOJIS } from '../../config/constants.js';
export default {
    name: 'addpremiumcmd',
    aliases: ['createpremium', 'nuevopremium'],
    description: 'Crear un comando premium (solo admins)',
    category: 'admin',
    permissions: 'admin',
    scope: 'group',
    cooldown: 5,
    enabled: true,
    async execute({ sock, msg, args, groupId, userPhone, replyJid }) {
        if (args.length < 3) {
            await sock.sendMessage(replyJid, formatError('Uso incorrecto\n\n') +
                'Uso: .addpremiumcmd {nombre} {precio} {descripción}\n\n' +
                'Ejemplo: .addpremiumcmd igdownload 5000 Descarga posts de Instagram 📸');
            return;
        }
        const commandName = args[0].toLowerCase();
        const price = parseInt(args[1]);
        const description = args.slice(2).join(' ');
        if (isNaN(price) || price < 0) {
            await sock.sendMessage(replyJid, formatError('El precio debe ser un número válido mayor o igual a 0'));
            return;
        }
        try {
            const db = getFirestore();
            const normalized = normalizeGroupId(groupId);
            const existingDoc = await db.collection('groups')
                .doc(normalized)
                .collection('premium_commands')
                .doc(commandName)
                .get();
            if (existingDoc.exists) {
                await sock.sendMessage(replyJid, formatError('Ya existe un comando premium con ese nombre'));
                return;
            }
            const emojiMatch = description.match(/[\u{1F300}-\u{1F9FF}]/u);
            const emoji = emojiMatch ? emojiMatch[0] : '📦';
            const commandData = {
                commandName,
                displayName: commandName.charAt(0).toUpperCase() + commandName.slice(1),
                description: description.replace(emoji, '').trim(),
                emoji,
                category: 'utility',
                price,
                isAvailable: true,
                requiresAdmin: false,
                usage: `.${commandName} {parámetros}`,
                cooldown: 10,
                totalPurchases: 0,
                totalUses: 0,
                uniqueBuyers: 0,
                createdAt: getNow(),
                updatedAt: getNow(),
                createdBy: userPhone
            };
            await db.collection('groups')
                .doc(normalized)
                .collection('premium_commands')
                .doc(commandName)
                .set(commandData);
            let response = `✅ *COMANDO PREMIUM CREADO*\n\n`;
            response += `Comando: ${commandName}\n`;
            response += `Nombre: ${commandData.displayName} ${emoji}\n`;
            response += `Precio: ${price.toLocaleString()} puntos\n`;
            response += `Descripción: ${commandData.description}\n\n`;
            response += `Los usuarios podrán comprarlo con:\n`;
            response += `.buypremium ${commandName}`;
            await sock.sendMessage(replyJid, response);
            logger.info(`${EMOJIS.SUCCESS} Comando premium "${commandName}" creado por ${userPhone}`);
        }
        catch (error) {
            logger.error(`${EMOJIS.ERROR} Error al crear comando premium:`, error);
            await sock.sendMessage(replyJid, formatError('Error al crear comando premium'));
        }
    }
};
