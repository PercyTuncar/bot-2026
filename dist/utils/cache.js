class CacheManager {
    cache;
    ttls;
    constructor() {
        this.cache = new Map();
        this.ttls = new Map();
        setInterval(() => this.cleanup(), 120000);
    }
    get(key) {
        const ttl = this.ttls.get(key);
        if (!ttl || Date.now() > ttl) {
            this.delete(key);
            return null;
        }
        return this.cache.get(key);
    }
    set(key, value, ttlMs = 60000) {
        this.cache.set(key, value);
        this.ttls.set(key, Date.now() + ttlMs);
    }
    delete(key) {
        this.cache.delete(key);
        this.ttls.delete(key);
    }
    cleanup() {
        const now = Date.now();
        for (const [key, ttl] of this.ttls.entries()) {
            if (now > ttl) {
                this.delete(key);
            }
        }
    }
    clear() {
        this.cache.clear();
        this.ttls.clear();
    }
    getStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}
const cacheManager = new CacheManager();
export default cacheManager;
export { CacheManager };
