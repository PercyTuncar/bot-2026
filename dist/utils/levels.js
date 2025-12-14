import { DEFAULT_GROUP_CONFIG } from '../config/constants.js';
import logger from '../lib/logger.js';
export function calculateLevel(points, levels = DEFAULT_GROUP_CONFIG.levels) {
    if (!levels || levels.length === 0) {
        return { level: 1, name: "Newbie", minPoints: 0, maxPoints: 1999, color: "#808080" };
    }
    const sortedLevels = [...levels].sort((a, b) => a.minPoints - b.minPoints);
    for (let i = sortedLevels.length - 1; i >= 0; i--) {
        const levelConfig = sortedLevels[i];
        if (points >= levelConfig.minPoints && points <= levelConfig.maxPoints) {
            return levelConfig;
        }
    }
    return sortedLevels[0];
}
export function checkLevelUp(oldPoints, newPoints, levels = DEFAULT_GROUP_CONFIG.levels) {
    const oldLevel = calculateLevel(oldPoints, levels);
    const newLevel = calculateLevel(newPoints, levels);
    if (newLevel.level > oldLevel.level) {
        logger.info(`¡Subida de nivel detectada! ${oldLevel.level} → ${newLevel.level}`);
        return {
            leveled: true,
            oldLevel,
            newLevel,
            message: `🎉 *¡NIVEL ALCANZADO!*\n\n¡Has subido a *${newLevel.name}*!\nNivel ${newLevel.level} • ${newPoints} puntos`
        };
    }
    return null;
}
export function getLevelProgress(points, levels = DEFAULT_GROUP_CONFIG.levels) {
    const currentLevel = calculateLevel(points, levels);
    const sortedLevels = [...levels].sort((a, b) => a.minPoints - b.minPoints);
    const currentIndex = sortedLevels.findIndex(l => l.level === currentLevel.level);
    const nextLevel = sortedLevels[currentIndex + 1];
    if (!nextLevel) {
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
export function formatProgressBar(percentage, length = 10) {
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
