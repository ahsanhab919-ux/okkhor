import { randomInt } from "node:crypto";

/**
 * The reset code length. A 6-digit numeric code is typeable on a feature phone, unlike the
 * 48-character hex token it replaces (`password-reset-delivery-slice.md` §13 decision 3). Its
 * short space is safe because the code is single-use, time-boxed, and the confirm endpoint is
 * rate-limited.
 */
export const PASSWORD_RESET_CODE_LENGTH = 6;

/**
 * Generates a cryptographically secure numeric reset code, zero-padded to a fixed length so every
 * code is exactly `PASSWORD_RESET_CODE_LENGTH` digits (for example `"007123"`).
 */
export function generatePasswordResetCode(): string {
  const exclusiveMax = 10 ** PASSWORD_RESET_CODE_LENGTH;

  return randomInt(0, exclusiveMax).toString().padStart(PASSWORD_RESET_CODE_LENGTH, "0");
}
