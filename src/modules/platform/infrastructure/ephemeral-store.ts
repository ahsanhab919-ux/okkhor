import { createClient } from "redis";

/**
 * Redis is adopted for cache and ephemeral state, and only for that (ADR-005).
 * Every key class reachable through this boundary must be short-lived and safely
 * reconstructible, and losing the store must degrade behaviour rather than lose data.
 */
export type EphemeralStore = {
  /**
   * Atomically increments a counter and applies the window TTL on first use.
   * The returned value is the count after incrementing.
   */
  increment(key: string, windowSeconds: number): Promise<number>;
};

type EphemeralStorageDriver = "auto" | "memory" | "redis";

type MemoryCounter = {
  count: number;
  expiresAt: number;
};

declare global {
  var __okkhorMemoryEphemeralStore: EphemeralStore | undefined;
  var __okkhorRedisClient: ReturnType<typeof createClient> | undefined;
}

function getDriver(): EphemeralStorageDriver {
  const driver = process.env.EPHEMERAL_STORAGE_DRIVER;

  if (driver === "memory" || driver === "redis") {
    return driver;
  }

  return "auto";
}

function createMemoryCounterStore(): EphemeralStore {
  const counters = new Map<string, MemoryCounter>();

  return {
    async increment(key, windowSeconds) {
      const now = Date.now();
      const existing = counters.get(key);

      if (!existing || existing.expiresAt <= now) {
        const counter: MemoryCounter = { count: 1, expiresAt: now + windowSeconds * 1000 };
        counters.set(key, counter);

        return counter.count;
      }

      existing.count += 1;

      return existing.count;
    },
  };
}

function getMemoryEphemeralStore(): EphemeralStore {
  if (!globalThis.__okkhorMemoryEphemeralStore) {
    globalThis.__okkhorMemoryEphemeralStore = createMemoryCounterStore();
  }

  return globalThis.__okkhorMemoryEphemeralStore;
}

async function getRedisClient() {
  const url = process.env.REDIS_URL;

  if (!url) {
    throw new Error("REDIS_URL is required when EPHEMERAL_STORAGE_DRIVER=redis.");
  }

  let client = globalThis.__okkhorRedisClient;

  if (!client) {
    client = createClient({
      url,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: 2000,
        reconnectStrategy: (retries) => Math.min(retries * 100, 2000),
      },
    });
    // Errors are surfaced per call so the rate limiter can degrade instead of failing the request.
    client.on("error", () => {});
    globalThis.__okkhorRedisClient = client;
  }

  if (!client.isOpen) {
    await client.connect();
  }

  return client;
}

function createRedisEphemeralStore(): EphemeralStore {
  return {
    async increment(key, windowSeconds) {
      const client = await getRedisClient();
      const count = await client.incr(key);

      if (count === 1) {
        await client.expire(key, windowSeconds);
      }

      return count;
    },
  };
}

let redisEphemeralStore: EphemeralStore | undefined;

function getRedisEphemeralStore(): EphemeralStore {
  if (!redisEphemeralStore) {
    redisEphemeralStore = createRedisEphemeralStore();
  }

  return redisEphemeralStore;
}

export function getEphemeralStore(): EphemeralStore {
  const driver = getDriver();

  if (driver === "memory") {
    return getMemoryEphemeralStore();
  }

  if (driver === "redis") {
    return getRedisEphemeralStore();
  }

  if (process.env.NODE_ENV === "test") {
    return getMemoryEphemeralStore();
  }

  // Redis is optional by design: without REDIS_URL the application still runs, using memory.
  if (process.env.REDIS_URL) {
    return getRedisEphemeralStore();
  }

  return getMemoryEphemeralStore();
}

export function resetEphemeralStoreForTesting() {
  globalThis.__okkhorMemoryEphemeralStore = createMemoryCounterStore();
  redisEphemeralStore = undefined;
}
