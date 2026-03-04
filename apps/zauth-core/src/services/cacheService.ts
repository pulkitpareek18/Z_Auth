import { createClient } from "redis";
import { config } from "../config.js";

class InMemoryCache {
  private readonly store = new Map<string, { value: string; expiresAt: number | null }>();

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export type CacheLike = {
  set: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
  get: (key: string) => Promise<string | null>;
  del: (key: string) => Promise<void>;
};

let redisClient: ReturnType<typeof createClient> | null = null;
let cacheType: "redis" | "memory" = "memory";
let cache: CacheLike = new InMemoryCache();

export async function initializeCache(): Promise<void> {
  try {
    const client = createClient({ url: config.redisUrl });
    const fallbackToMemory = () => {
      console.warn("Redis connection lost. Falling back to in-memory cache.");
      cacheType = "memory";
      cache = new InMemoryCache();
      redisClient = null;
    };
    client.on("error", (error) => {
      console.error("Redis error:", error.message ?? error);
      // Actually fall back to in-memory cache so operations don't throw
      if (cacheType === "redis") {
        fallbackToMemory();
      }
    });
    await client.connect();
    redisClient = client;
    cacheType = "redis";
    cache = {
      set: async (key, value, ttlSeconds) => {
        if (ttlSeconds) {
          await client.set(key, value, { EX: ttlSeconds });
          return;
        }
        await client.set(key, value);
      },
      get: async (key) => client.get(key),
      del: async (key) => {
        await client.del(key);
      }
    };
    console.log("Cache: using Redis");
  } catch (error) {
    console.warn("Redis unavailable. Using in-memory cache", error);
    cacheType = "memory";
    cache = new InMemoryCache();
  }
}

export function getCache(): CacheLike {
  return cache;
}

export function getCacheType(): "redis" | "memory" {
  return cacheType;
}

export async function closeCache(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
  }
}
