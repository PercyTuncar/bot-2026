import { Timestamp } from 'firebase-admin/firestore';

/**
 * Obtiene el timestamp actual de Firestore
 */
export function getNow(): Timestamp {
  return Timestamp.now();
}

/**
 * Convierte una fecha a Timestamp de Firestore
 */
export function toTimestamp(date: Date | number | string | Timestamp): Timestamp {
  if (date instanceof Timestamp) {
    return date;
  }
  
  if (date instanceof Date) {
    return Timestamp.fromDate(date);
  }
  
  if (typeof date === 'number') {
    return Timestamp.fromMillis(date);
  }
  
  if (typeof date === 'string') {
    return Timestamp.fromDate(new Date(date));
  }
  
  return Timestamp.now();
}

/**
 * Verifica si han pasado X segundos desde una fecha
 */
export function hasPassedSeconds(date: Date | Timestamp, seconds: number): boolean {
  if (!date) return true;
  
  const d = date instanceof Timestamp ? date.toDate() : (date instanceof Date ? date : new Date());
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  
  return diff >= seconds;
}

/**
 * Verifica si han pasado X minutos desde una fecha
 */
export function hasPassedMinutes(date: Date | Timestamp, minutes: number): boolean {
  return hasPassedSeconds(date, minutes * 60);
}

export default {
  getNow,
  toTimestamp,
  hasPassedSeconds,
  hasPassedMinutes
};
