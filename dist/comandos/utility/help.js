import { getCommandsByCategory, getCommand } from '../../core/command-loader.js';
import { PERMISSION_LEVELS } from '../../config/constants.js';
import { bold, italic, codeInline, bulletList, section, joinSections } from '../../utils/message-builder.js';
import { reply } from '../../utils/reply.js';
export default {
    name: 'help',
    aliases: ['ayuda', 'comandos', 'commands'],
    description: 'Mostrar ayuda de comandos',
    category: 'utility',
    permissions: 'user',
    scope: 'any',
    cooldown: 5,
    async execute({ sock, args, permissions, replyJid, msg }) {
        if (args.length > 0) {
            const cmdName = args[0].toLowerCase().replace('.', '');
            const cmd = getCommand(cmdName);
            if (cmd) {
                const header = `📖 ${bold(`AYUDA: .${cmd.name}`)}`;
                const items = [
                    `📝 ${bold('Descripción')}: ${cmd.description || 'Sin descripción'}`,
                    `📁 ${bold('Categoría')}: ${cmd.category || 'general'}`,
                    `🔐 ${bold('Permisos')}: ${cmd.permissions || 'user'}`,
                    `🌐 ${bold('Alcance')}: ${cmd.scope === 'group' ? 'Solo grupos' : cmd.scope === 'dm' ? 'Solo DM' : 'Cualquiera'}`,
                    cmd.cooldown ? `⏱️ ${bold('Cooldown')}: ${cmd.cooldown}s` : null,
                    cmd.aliases?.length ? `🔄 ${bold('Aliases')}: ${cmd.aliases.join(', ')}` : null,
                    cmd.usage ? `💡 ${bold('Uso')}: ${codeInline(cmd.usage)}` : null,
                    cmd.example ? `📌 ${bold('Ejemplo')}: ${codeInline(cmd.example)}` : null
                ].filter(Boolean);
                await reply(sock, msg, joinSections([header, bulletList(items)]));
                return;
            }
            else {
                await reply(sock, msg, joinSections([`${bold('❌ Comando no encontrado')}: ${italic(cmdName)}`, bulletList([`💡 Usa ${codeInline('.help')} para ver todos los comandos.`])]));
                return;
            }
        }
        const categories = [
            'general', 'utility', 'points', 'premium', 'rewards',
            'prizes', 'moderation', 'tags', 'stats', 'admin', 'owner', 'internal'
        ];
        const categoryInfo = {
            general: { name: 'General', emoji: '🌐' },
            utility: { name: 'Utilidades', emoji: '🛠️' },
            points: { name: 'Puntos', emoji: '💎' },
            premium: { name: 'Premium', emoji: '👑' },
            rewards: { name: 'Recompensas', emoji: '🎁' },
            prizes: { name: 'Premios', emoji: '🏆' },
            moderation: { name: 'Moderación', emoji: '🛡️' },
            tags: { name: 'Etiquetas', emoji: '🏷️' },
            stats: { name: 'Estadísticas', emoji: '📊' },
            admin: { name: 'Administración', emoji: '⚙️' },
            owner: { name: 'Owner', emoji: '🔑' },
            internal: { name: 'Internos', emoji: '🤖' }
        };
        const getPermissionLevel = (permissionString) => {
            switch (permissionString?.toLowerCase()) {
                case 'owner': return PERMISSION_LEVELS.OWNER;
                case 'global_admin':
                case 'globaladmin': return PERMISSION_LEVELS.GLOBAL_ADMIN;
                case 'group_admin':
                case 'groupadmin': return PERMISSION_LEVELS.GROUP_ADMIN;
                case 'user':
                default: return PERMISSION_LEVELS.USER;
            }
        };
        let sections = [`🤖 ${bold('COMANDOS DISPONIBLES')}`];
        let totalCommands = 0;
        for (const category of categories) {
            const categoryCommands = getCommandsByCategory(category)
                .filter(cmd => {
                if (cmd.enabled === false)
                    return false;
                const requiredLevel = getPermissionLevel(cmd.permissions);
                return permissions.level >= requiredLevel;
            })
                .sort((a, b) => a.name.localeCompare(b.name));
            if (!categoryCommands.length)
                continue;
            const info = categoryInfo[category] || { name: category, emoji: '📦' };
            const items = categoryCommands.map(cmd => `${codeInline('.' + cmd.name)} - ${cmd.description || 'Sin descripción'}`);
            totalCommands += categoryCommands.length;
            sections.push(section(`${info.emoji} ${bold(info.name)} (${categoryCommands.length})`, items));
        }
        sections.push(bulletList([`📊 ${bold('Total')}: ${totalCommands} comandos disponibles`, `💡 Tip: Usa ${italic('.help [comando]')} para ver detalles`, `📌 Ejemplo: ${italic('.help mypoints')}`]));
        await reply(sock, msg, joinSections(sections));
    }
};
