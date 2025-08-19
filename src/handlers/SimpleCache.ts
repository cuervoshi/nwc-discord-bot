interface CacheEntry<T> {
  value: T;
  timeout: NodeJS.Timeout;
}

class SimpleCache {
  private cache: Map<string, CacheEntry<any>>;

  constructor() {
    this.cache = new Map();
  }

  set<T>(key: string, value: T, ttl: number): void {
    if (this.cache.has(key)) {
      clearTimeout(this.cache.get(key)!.timeout);
    }

    const timeout = setTimeout(() => {
      this.cache.delete(key);
    }, ttl);

    this.cache.set(key, { value, timeout });
  }

  get<T>(key: string): T | undefined {
    const cacheEntry = this.cache.get(key);
    return cacheEntry ? cacheEntry.value : undefined;
  }

  delete(key: string): void {
    const cacheEntry = this.cache.get(key);
    if (cacheEntry) {
      clearTimeout(cacheEntry.timeout);
      this.cache.delete(key);
    }
  }
}

export default SimpleCache;
