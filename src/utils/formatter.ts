import { EMOJIS } from '../config/constants.js';

/**
 * Formatea un número con separadores de miles
 * @param {number} num - Número a formatear
 * @returns {string} - Número formateado
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-AR').format(num);
}

/**
 * Formatea una fecha
 * @param {Date|Timestamp|string|number} date - Fecha a formatear
 * @returns {string} - Fecha formateada
 */
export function formatDate(date: any): string {
  if (!date) return 'N/A';

  const d = date.toDate ? date.toDate() : new Date(date);
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
}

/**
 * Formatea tiempo relativo (hace X tiempo)
 * @param {Date|Timestamp|string|number} date - Fecha
 * @returns {string} - Tiempo relativo
 */
export function formatRelativeTime(date: any): string {
  if (!date) return 'N/A';

  const d = date.toDate ? date.toDate() : new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `Hace ${days} día${days > 1 ? 's' : ''}`;
  if (hours > 0) return `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `Hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
  return 'Hace unos segundos';
}

/**
 * Reemplaza placeholders en un mensaje
 * @param {string} text - Texto con placeholders
 * @param {object} data - Datos para reemplazar
 * @returns {string} - Texto con placeholders reemplazados
 */
export function replacePlaceholders(text: string, data: Record<string, any>): string {
  let result = text;

  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }

  return result;
}

/**
 * Formatea un mensaje de error para Baileys
 * @param {string} message - Mensaje de error
 * @returns {{ text: string }} - Objeto Baileys con mensaje formateado
 */
export function formatError(message: string): { text: string } {
  return { text: `${EMOJIS.ERROR} ${message}` };
}

/**
 * Formatea un mensaje de éxito para Baileys
 * @param {string} message - Mensaje de éxito
 * @returns {{ text: string }} - Objeto Baileys con mensaje formateado
 */
export function formatSuccess(message: string): { text: string } {
  return { text: `${EMOJIS.SUCCESS} ${message}` };
}

export default {
  formatNumber,
  formatDate,
  formatRelativeTime,
  replacePlaceholders,
  formatError,
  formatSuccess
};

