import {
  getEphemeralStore,
  resetEphemeralStoreForTesting,
} from "@/src/modules/platform/infrastructure/ephemeral-store";

describe("ephemeral store", () => {
  const originalDriver = process.env.EPHEMERAL_STORAGE_DRIVER;
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    resetEphemeralStoreForTesting();
    delete process.env.EPHEMERAL_STORAGE_DRIVER;
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    resetEphemeralStoreForTesting();

    if (originalDriver === undefined) {
      delete process.env.EPHEMERAL_STORAGE_DRIVER;
    } else {
      process.env.EPHEMERAL_STORAGE_DRIVER = originalDriver;
    }

    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalRedisUrl;
    }
  });

  it("falls back to in-memory counters when Redis is not configured", async () => {
    const store = getEphemeralStore();

    expect(await store.increment("okkhor:test:counter", 60)).toBe(1);
    expect(await store.increment("okkhor:test:counter", 60)).toBe(2);
  });

  it("expires a counter once its window has elapsed", async () => {
    const store = getEphemeralStore();

    expect(await store.increment("okkhor:test:window", 0)).toBe(1);
    expect(await store.increment("okkhor:test:window", 0)).toBe(1);
  });

  it("honours an explicit memory driver", async () => {
    process.env.EPHEMERAL_STORAGE_DRIVER = "memory";
    const store = getEphemeralStore();

    expect(await store.increment("okkhor:test:key", 60)).toBe(1);
  });

  it("surfaces an error when the redis driver is forced without a connection url", async () => {
    process.env.EPHEMERAL_STORAGE_DRIVER = "redis";
    const store = getEphemeralStore();

    await expect(store.increment("okkhor:test:key", 60)).rejects.toThrow("REDIS_URL is required");
  });
});
