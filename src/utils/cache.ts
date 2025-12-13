/**
 * Sistema de caché para reducir lecturas de Firebase
 */

class CacheManager {
  private cache: Map<string, any>;
  private ttls: Map<string, number>;

  constructor() {
    this.cache = new Map();
    this.ttls = new Map();
    
    // Limpieza automática cada 2 minutos
    setInterval(() => this.cleanup(), 120000);
  }

  /**
   * Obtiene un valor del caché
   */
  get(key) {
    const ttl = this.ttls.get(key);
    if (!ttl || Date.now() > ttl) {
      this.delete(key);
      return null;
    }
    return this.cache.get(key);
  }

  /**
   * Guarda un valor en el caché
   */
  set(key, value, ttlMs = 60000) {
    this.cache.set(key, value);
    this.ttls.set(key, Date.now() + ttlMs);
  }

  /**
   * Elimina un valor del caché
   */
  delete(key) {
    this.cache.delete(key);
    this.ttls.delete(key);
  }

  /**
   * Limpia valores expirados
   */
  cleanup() {
    const now = Date.now();
    for (const [key, ttl] of this.ttls.entries()) {
      if (now > ttl) {
        this.delete(key);
      }
    }
  }

  /**
   * Limpia todo el caché
   */
  clear() {
    this.cache.clear();
    this.ttls.clear();
  }

  /**
   * Obtiene estadísticas del caché
   */
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Instancia global
const cacheManager = new CacheManager();

export default cacheManager;
export { CacheManager };
