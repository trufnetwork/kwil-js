export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
}

export class InMemoryCache<T> {
  private cache: Map<string, { data: T, timestamp: number }> = new Map();
  private readonly ttl: number;

  constructor(options: CacheOptions = {}) {
    this.ttl = options.ttl || 24 * 60 * 60 * 1000; // Default 1 day
  }

  /**
   * Get value from cache or fetch it using the provided function
   */
  async get(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < this.ttl) {
        return cached.data;
      }
      // Expired - remove it
      this.cache.delete(key);
    }

    // Fetch new data
    const data = await fetcher();
    
    // Cache it
    this.set(key, data);
    
    return data;
  }

  /**
   * Set a value in the cache
   */
  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const cached = this.cache.get(key);
    if (!cached) return false;
    
    const age = Date.now() - cached.timestamp;
    if (age >= this.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Get value directly without fetcher (returns undefined if not found or expired)
   */
  getValue(key: string): T | undefined {
    const cached = this.cache.get(key);
    if (!cached) return undefined;
    
    const age = Date.now() - cached.timestamp;
    if (age >= this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    
    return cached.data;
  }

  /**
   * Delete specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }
}