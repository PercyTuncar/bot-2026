import { DEFAULT_GROUP_CONFIG } from '../config/constants.js';
import logger from '../lib/logger.js';
import { LevelConfig } from '../types/firestore.types.js';

/**
 * Calcula el nivel actual según los puntos
 * @param {number} points - Puntos del usuario
 * @param {Array} levels - Array de configuración de niveles
 * @returns {Object} - Objeto con nivel actual
 */
export function calculateLevel(points: number, levels: LevelConfig[] = DEFAULT_GROUP_CONFIG.levels): LevelConfig {
  if (!levels || levels.length === 0) {
    return { level: 1, name: "Newbie", minPoints: 0, maxPoints: 1999, color: "#808080" };
  }

  // Ordenar niveles por minPoints
  const sortedLevels = [...levels].sort((a, b) => a.minPoints - b.minPoints);

  // Encontrar el nivel correspondiente
  for (let i = sortedLevels.length - 1; i >= 0; i--) {
    const levelConfig = sortedLevels[i];
    if (points >= levelConfig.minPoints && points <= levelConfig.maxPoints) {
      return levelConfig;
    }
  }

  // Si no encuentra, retornar el primer nivel
  return sortedLevels[0];
}

/**
 * Verifica si el usuario subió de nivel
 * @param {number} oldPoints - Puntos anteriores
 * @param {number} newPoints - Puntos nuevos
 * @param {Array} levels - Array de configuración de niveles
 * @returns {Object|null} - Objeto con información de subida de nivel o null
 */
export function checkLevelUp(oldPoints: number, newPoints: number, levels: LevelConfig[] = DEFAULT_GROUP_CONFIG.levels) {
  const oldLevel = calculateLevel(oldPoints, levels);
  const newLevel = calculateLevel(newPoints, levels);

  if (newLevel.level > oldLevel.level) {
    logger.info(`¡Subida de nivel detectada! ${oldLevel.level} → ${newLevel.level}`);
    return {
      leveled: true,
      oldLevel,
      newLevel,
      message: `\n\n🏆 *¡SUBIDA DE NIVEL!* 🏆\n\n` +
        `⬆️ Has alcanzado el nivel *${newLevel.level}*\n` +
        `🎖️ Rango: *${newLevel.name}*\n` +
        `💎 Puntos: *${newPoints}*\n\n` +
        `¡Felicitaciones! 🎊`
    };
  }

  return null;
}

/**
 * Obtiene información de progreso hacia el siguiente nivel
 * @param {number} points - Puntos actuales
 * @param {Array} levels - Array de configuración de niveles
 * @returns {Object} - Información de progreso
 */
export function getLevelProgress(points: number, levels: LevelConfig[] = DEFAULT_GROUP_CONFIG.levels) {
  const currentLevel = calculateLevel(points, levels);
  const sortedLevels = [...levels].sort((a, b) => a.minPoints - b.minPoints);

  const currentIndex = sortedLevels.findIndex(l => l.level === currentLevel.level);
  const nextLevel = sortedLevels[currentIndex + 1];

  if (!nextLevel) {
    // Ya está en el nivel máximo
    return {
      current: currentLevel,
      next: null,
      progress: 100,
      pointsToNext: 0,
      isMaxLevel: true
    };
  }

  const pointsInCurrentLevel = points - currentLevel.minPoints;
  const pointsNeededForNext = nextLevel.minPoints - currentLevel.minPoints;
  const progress = Math.min(100, (pointsInCurrentLevel / pointsNeededForNext) * 100);
  const pointsToNext = nextLevel.minPoints - points;

  return {
    current: currentLevel,
    next: nextLevel,
    progress: Math.round(progress),
    pointsToNext,
    isMaxLevel: false
  };
}

/**
 * Formatea la barra de progreso visual
 * @param {number} percentage - Porcentaje de progreso (0-100)
 * @param {number} length - Longitud de la barra
 * @returns {string} - Barra de progreso
 */
export function formatProgressBar(percentage: number, length: number = 10): string {
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export default {
  calculateLevel,
  checkLevelUp,
  getLevelProgress,
  formatProgressBar
};
