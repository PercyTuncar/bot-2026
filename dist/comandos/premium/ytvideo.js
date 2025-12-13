export default {
    name: 'ytvideo',
    description: 'Descargar video de YouTube',
    category: 'premium',
    permissions: 'user',
    scope: 'group',
    purchaseRequired: true,
    cooldown: 60,
    async execute({ sock, args, member, replyJid }) {
        const url = args[0];
        if (!url) {
            await sock.sendMessage(replyJid, '❌ Debes proporcionar una URL de YouTube');
            return;
        }
        await sock.sendMessage(replyJid, `📥 Descargando video... (Tienes ${member?.points || 0} puntos)\n\n` +
            '⚠️ Esta funcionalidad está en desarrollo');
    }
};
