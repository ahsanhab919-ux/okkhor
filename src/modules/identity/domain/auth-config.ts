export const ACCESS_TOKEN_COOKIE = "okkhor_access";
export const REFRESH_TOKEN_COOKIE = "okkhor_refresh";

export const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 15;
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const PASSWORD_RESET_MAX_AGE_SECONDS = 60 * 15;

const FALLBACK_JWT_SECRET = "okkhor-dev-secret-change-me-before-production";

export function getAuthSecret() {
  return process.env.AUTH_JWT_SECRET || FALLBACK_JWT_SECRET;
}

export function getAuthSecretKey(): Uint8Array {
  return new TextEncoder().encode(getAuthSecret());
}
