import { readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commands = new Map();

/**
 * Carga todos los comandos desde los directorios
 */
export async function loadCommands() {
  commands.clear();
  
  const commandsDir = join(__dirname, '../comandos');
  // TODAS las carpetas de comandos existentes
  const categories = ['general', 'utility', 'points', 'premium', 'rewards', 'prizes', 'moderation', 'tags', 'stats', 'admin', 'owner', 'internal'];

  for (const category of categories) {
    const categoryPath = join(commandsDir, category);
    
    try {
      const files = await readdir(categoryPath);
      const jsFiles = files.filter(f => f.endsWith('.js'));

      for (const file of jsFiles) {
        try {
          const filePath = join(categoryPath, file);
          const commandModule = await import(`file://${filePath}`);
          const command = commandModule.default || commandModule;

          if (command.name) {
            commands.set(command.name, { ...command, category });
            
            // Registrar aliases
            if (command.aliases && Array.isArray(command.aliases)) {
              for (const alias of command.aliases) {
                commands.set(alias, { ...command, category, isAlias: true });
              }
            }

            logger.info(`Comando cargado: ${command.name} (${category})`);
          }
        } catch (error) {
          logger.error(`Error al cargar comando ${file}:`, error);
        }
      }
    } catch (error) {
      logger.warn(`No se pudo leer directorio ${category}:`, error);
    }
  }

  logger.info(`Total de comandos cargados: ${commands.size}`);
  return commands;
}

/**
 * Obtiene un comando por nombre
 */
export function getCommand(name) {
  return commands.get(name?.toLowerCase());
}

/**
 * Obtiene todos los comandos
 */
export function getAllCommands() {
  return Array.from(commands.values()).filter(cmd => !cmd.isAlias);
}

/**
 * Obtiene comandos por categoría
 */
export function getCommandsByCategory(category) {
  return getAllCommands().filter(cmd => cmd.category === category);
}

export default { loadCommands, getCommand, getAllCommands, getCommandsByCategory };

