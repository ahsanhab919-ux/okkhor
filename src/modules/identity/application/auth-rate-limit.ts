import { createHash } from "node:crypto";

import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import { getEphemeralStore } from "@/src/modules/platform/infrastructure/ephemeral-store";

/**
 * Auth rate limiting is the first workload on the ADR-005 ephemeral boundary.
 * Counters live in Redis when it is configured and fall back to memory otherwise.
 * Windows and namespacing are documented in docs/configuration.md.
 */
export const AUTH_RATE_LIMITS = {
  login: { keyPrefix: "okkhor:ratelimit:auth:login", limit: 10, windowSeconds: 300 },
  register: { keyPrefix: "okkhor:ratelimit:auth:register", limit: 5, windowSeconds: 3600 },
  passwordResetRequest: {
    keyPrefix: "okkhor:ratelimit:auth:password-reset",
    limit: 5,
    windowSeconds: 3600,
  },
} as const;

export type AuthRateLimitScope = keyof typeof AUTH_RATE_LIMITS;

/**
 * Identifiers are hashed before they reach a key, so raw personal values such as a
 * client address never appear in the keyspace or in logs (ADR-005 security impact).
 */
function buildKey(keyPrefix: string, identifier: string) {
  const digest = createHash("sha256").update(identifier).digest("hex");

  return `${keyPrefix}:${digest}`;
}

/**
 * Counts one attempt for the scope and throws a 429 when the window budget is spent.
 * If the ephemeral store is unavailable the request is allowed through: losing the
 * store must degrade behaviour rather than fail it (ADR-005).
 */
export async function enforceAuthRateLimit(scope: AuthRateLimitScope, identifier: string) {
  const rule = AUTH_RATE_LIMITS[scope];

  let count: number;

  try {
    count = await getEphemeralStore().increment(buildKey(rule.keyPrefix, identifier), rule.windowSeconds);
  } catch {
    return;
  }

  if (count > rule.limit) {
    throw new AuthError("Too many attempts. Please try again later.", "AUTH_RATE_LIMITED", 429);
  }
}
