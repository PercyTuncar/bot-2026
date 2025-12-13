import { normalizePhone } from './phone.js';

/**
 * Valida si un texto es un comando válido
 * @param {string} text - Texto a validar
 * @param {string} prefix - Prefijo de comandos
 * @returns {boolean}
 */
export function isValidCommand(text, prefix = '.') {
  if (!text || typeof text !== 'string') return false;
  return text.trim().startsWith(prefix);
}

/**
 * Valida si un mensaje cuenta para puntos
 * @param {object} msg - Mensaje de whatsapp-web.js
 * @param {string} prefix - Prefijo de comandos
 * @returns {boolean}
 */
export function isValidMessageForPoints(msg, prefix = '.') {
  // Solo mensajes de texto
  if (!msg.body || typeof msg.body !== 'string') return false;

  const text = msg.body || '';

  // No debe ser comando (EXCEPTO .mypoints que el usuario quiere contar)
  const isMypoints = text.trim() === `${prefix}mypoints`;
  if (text.trim().startsWith(prefix) && !isMypoints) {
    return false;
  }

  // Debe tener al menos 3 caracteres
  if (text.trim().length < 3) {
    return false;
  }

  return true;
}

/**
 * Valida un número de teléfono
 * @param {string} phone - Número a validar
 * @returns {boolean}
 */
export function isValidPhone(phone) {
  if (!phone) return false;
  const normalized = normalizePhone(phone);
  return normalized.length >= 10 && /^\d+$/.test(normalized);
}

/**
 * Valida un código de premio
 * @param {string} code - Código a validar
 * @returns {boolean}
 */
export function isValidPrizeCode(code) {
  if (!code || typeof code !== 'string') return false;
  return /^[A-Z0-9_]+$/.test(code.trim().toUpperCase()) && code.trim().length >= 3;
}

/**
 * Valida cantidad de puntos
 * @param {number} points - Puntos a validar
 * @returns {boolean}
 */
export function isValidPoints(points) {
  return typeof points === 'number' && points >= 0 && Number.isInteger(points);
}

export default {
  isValidCommand,
  isValidMessageForPoints,
  isValidPhone,
  isValidPrizeCode,
  isValidPoints
};

