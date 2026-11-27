import {
  AUTH_RATE_LIMITS,
  enforceAuthRateLimit,
} from "@/src/modules/identity/application/auth-rate-limit";
import { resetEphemeralStoreForTesting } from "@/src/modules/platform/infrastructure/ephemeral-store";

describe("auth rate limit", () => {
  beforeEach(() => {
    resetEphemeralStoreForTesting();
    delete process.env.EPHEMERAL_STORAGE_DRIVER;
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    resetEphemeralStoreForTesting();
  });

  it("allows attempts up to the window budget and rejects the next one", async () => {
    const { limit } = AUTH_RATE_LIMITS.login;
    const identifier = "203.0.113.7";

    for (let attempt = 0; attempt < limit; attempt += 1) {
      await expect(enforceAuthRateLimit("login", identifier)).resolves.toBeUndefined();
    }

    await expect(enforceAuthRateLimit("login", identifier)).rejects.toMatchObject({
      code: "AUTH_RATE_LIMITED",
      status: 429,
    });
  });

  it("counts each identifier separately", async () => {
    const { limit } = AUTH_RATE_LIMITS.login;

    for (let attempt = 0; attempt < limit; attempt += 1) {
      await enforceAuthRateLimit("login", "203.0.113.7");
    }

    await expect(enforceAuthRateLimit("login", "203.0.113.8")).resolves.toBeUndefined();
  });

  it("degrades by allowing the request when the ephemeral store is unavailable", async () => {
    process.env.EPHEMERAL_STORAGE_DRIVER = "redis";
    delete process.env.REDIS_URL;

    for (let attempt = 0; attempt < AUTH_RATE_LIMITS.login.limit + 5; attempt += 1) {
      await expect(enforceAuthRateLimit("login", "203.0.113.9")).resolves.toBeUndefined();
    }
  });
});
