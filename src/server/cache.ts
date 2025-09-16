// Lazy load redis to keep it optional and avoid type resolution issues at build time
// Using 'any' to avoid a hard dependency on '@types/redis' at build time

class InMemoryCache {
  private readonly store = new Map<string, { value: string; expiresAt?: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

class CacheService {
  private redis: any | null = null;
  private readonly memory = new InMemoryCache();
  private connecting: Promise<void> | null = null;

  private async ensureRedis(): Promise<void> {
    if (this.redis) return;
    if (this.connecting) return this.connecting;
    const url = process.env['REDIS_URL'] || process.env['REDIS_CONNECTION_STRING'];
    if (!url) return; // no redis configured
    this.connecting = (async () => {
      try {
        const mod: any = await import('redis');
        const client: any = mod.createClient({ url });
        client.on('error', (err: unknown) => {
          console.error('[redis] error', err);
        });
        await client.connect();
        this.redis = client;
        console.log('[redis] connected');
      } catch (e) {
        // Fall back to in-memory cache when Redis is unavailable
        console.warn('[redis] failed to connect, falling back to memory cache', e);
        this.redis = null;
        return;
      }
    })();
    await this.connecting;
    this.connecting = null;
  }

  async get(key: string): Promise<string | null> {
    try {
      await this.ensureRedis();
      if (this.redis) {
        const v = await this.redis.get(key);
        if (v != null) return v;
      }
    } catch (e) {
      // Fall back to memory cache on any Redis error
      console.debug('[cache] get fallback to memory', e);
      return this.memory.get(key);
    }
    return this.memory.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      await this.ensureRedis();
      if (this.redis) {
        if (ttlSeconds && ttlSeconds > 0) {
          await this.redis.set(key, value, { EX: ttlSeconds });
        } else {
          await this.redis.set(key, value);
        }
        return;
      }
    } catch (e) {
      // Fall back to memory cache on any Redis error
      console.debug('[cache] set fallback to memory', e);
      await this.memory.set(key, value, ttlSeconds);
      return;
    }
    await this.memory.set(key, value, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    try {
      await this.ensureRedis();
      if (this.redis) {
        await this.redis.del(key);
      }
    } catch (e) {
      // Fall back to memory cache on any Redis error
      console.debug('[cache] del fallback to memory', e);
      await this.memory.del(key);
      return;
    }
    await this.memory.del(key);
  }

  async getJson<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const raw = JSON.stringify(value);
    await this.set(key, raw, ttlSeconds);
  }
}

export const cacheService = new CacheService();


