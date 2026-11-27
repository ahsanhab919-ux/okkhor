import { createHash, randomBytes, randomUUID } from "node:crypto";

import { compare, hash } from "bcryptjs";
import { ZodError } from "zod";

import {
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  PASSWORD_RESET_MAX_AGE_SECONDS,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
} from "@/src/modules/identity/domain/auth-config";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from "@/src/modules/identity/domain/auth-jwt";
import {
  type LoginInput,
  loginSchema,
  type PasswordResetConfirmInput,
  passwordResetConfirmSchema,
  type PasswordResetRequestInput,
  passwordResetRequestSchema,
  type RegistrationInput,
  registrationSchema,
} from "@/src/modules/identity/domain/auth-schemas";
import type {
  AuthSessionRecord,
  AuthSuccess,
  PasswordResetRecord,
  UserProfile,
  UserRecord,
} from "@/src/modules/identity/domain/auth-types";
import { getAuthRepository } from "@/src/modules/identity/infrastructure/auth-repository";

const PASSWORD_SALT_ROUNDS = 12;

function toIsoDate(secondsFromNow: number) {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString();
}

function hashOpaqueToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sanitizeUser(user: UserRecord): UserProfile {
  const { passwordHash: _passwordHash, ...profile } = user;

  return profile;
}

function parseSchema<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      const detail = error.issues[0]?.message || "Authentication request failed validation.";
      throw new AuthError(detail, "AUTH_VALIDATION_FAILED", 400);
    }

    throw error;
  }
}

async function createSessionForUser(user: UserRecord): Promise<AuthSuccess> {
  const repository = getAuthRepository();
  const sessionId = randomUUID();
  const accessToken = await signAccessToken(sanitizeUser(user), sessionId);
  const refreshToken = await signRefreshToken(user.id, sessionId);
  const accessExpiresAt = toIsoDate(ACCESS_TOKEN_MAX_AGE_SECONDS);
  const refreshExpiresAt = toIsoDate(REFRESH_TOKEN_MAX_AGE_SECONDS);

  const session: AuthSessionRecord = {
    id: sessionId,
    userId: user.id,
    refreshTokenHash: hashOpaqueToken(refreshToken),
    createdAt: new Date().toISOString(),
    expiresAt: refreshExpiresAt,
  };

  await repository.createSession(session);
  user.lastLoginAt = new Date().toISOString();
  user.updatedAt = user.lastLoginAt;
  await repository.updateUser(user);

  return {
    user: sanitizeUser(user),
    tokens: {
      accessToken,
      refreshToken,
      accessExpiresAt,
      refreshExpiresAt,
    },
  };
}

async function getUserByPhone(phoneNumber: string) {
  return getAuthRepository().getUserByPhone(phoneNumber);
}

async function getSessionOrThrow(sessionId: string) {
  const session = await getAuthRepository().getSessionById(sessionId);

  if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now()) {
    throw new AuthError("Session is invalid or expired.", "AUTH_UNAUTHORIZED", 401);
  }

  return session;
}

export async function registerUser(input: RegistrationInput): Promise<AuthSuccess> {
  const repository = getAuthRepository();
  const parsed = parseSchema(registrationSchema, input);

  if (await getUserByPhone(parsed.phoneNumber)) {
    throw new AuthError("A user already exists for this phone number.", "AUTH_USER_EXISTS", 409);
  }

  const now = new Date().toISOString();
  const user: UserRecord = {
    id: randomUUID(),
    phoneNumber: parsed.phoneNumber,
    displayName: parsed.displayName,
    locale: parsed.locale,
    roles: parsed.roles,
    createdAt: now,
    updatedAt: now,
    passwordUpdatedAt: now,
    passwordHash: await hash(parsed.password, PASSWORD_SALT_ROUNDS),
  };

  await repository.createUser(user);

  return createSessionForUser(user);
}

export async function loginUser(input: LoginInput): Promise<AuthSuccess> {
  const parsed = parseSchema(loginSchema, input);
  const user = await getUserByPhone(parsed.phoneNumber);

  if (!user) {
    throw new AuthError("Invalid phone number or password.", "AUTH_INVALID_CREDENTIALS", 401);
  }

  const passwordValid = await compare(parsed.password, user.passwordHash);

  if (!passwordValid) {
    throw new AuthError("Invalid phone number or password.", "AUTH_INVALID_CREDENTIALS", 401);
  }

  return createSessionForUser(user);
}

export async function getSessionFromAccessToken(accessToken: string) {
  const payload = await verifyAccessToken(accessToken);
  const user = await getAuthRepository().getUserById(payload.sub);

  if (!user) {
    throw new AuthError("Authenticated user no longer exists.", "AUTH_UNAUTHORIZED", 401);
  }

  return {
    user: sanitizeUser(user),
    sessionId: payload.sessionId,
  };
}

export async function refreshUserSession(refreshToken: string): Promise<AuthSuccess> {
  const payload = await verifyRefreshToken(refreshToken);
  const repository = getAuthRepository();
  const session = await getSessionOrThrow(payload.sessionId);
  const user = await repository.getUserById(payload.sub);

  if (!user || session.userId !== user.id || session.refreshTokenHash !== hashOpaqueToken(refreshToken)) {
    throw new AuthError("Refresh token is invalid.", "AUTH_TOKEN_INVALID", 401);
  }

  session.revokedAt = new Date().toISOString();
  await repository.updateSession(session);

  return createSessionForUser(user);
}

export async function logoutUser(refreshToken?: string) {
  if (!refreshToken) {
    return;
  }

  try {
    const payload = await verifyRefreshToken(refreshToken);
    const repository = getAuthRepository();
    const session = await repository.getSessionById(payload.sessionId);

    if (session) {
      session.revokedAt = new Date().toISOString();
      await repository.updateSession(session);
    }
  } catch {
    // Logout should remain idempotent even when the refresh token is already invalid.
  }
}

export async function requestPasswordReset(input: PasswordResetRequestInput) {
  const parsed = parseSchema(passwordResetRequestSchema, input);
  const user = await getUserByPhone(parsed.phoneNumber);

  if (!user) {
    return {
      accepted: true,
      message: "If the account exists, a reset instruction has been issued.",
    };
  }

  const token = randomBytes(24).toString("hex");
  const record: PasswordResetRecord = {
    id: randomUUID(),
    userId: user.id,
    tokenHash: hashOpaqueToken(token),
    createdAt: new Date().toISOString(),
    expiresAt: toIsoDate(PASSWORD_RESET_MAX_AGE_SECONDS),
  };

  await getAuthRepository().createPasswordReset(record);

  return {
    accepted: true,
    message: "Password reset created for delivery through the configured channel.",
    resetTokenPreview: token,
    expiresAt: record.expiresAt,
  };
}

export async function confirmPasswordReset(input: PasswordResetConfirmInput) {
  const parsed = parseSchema(passwordResetConfirmSchema, input);
  const repository = getAuthRepository();
  const targetTokenHash = hashOpaqueToken(parsed.token);
  const resetRecord = await repository.getPasswordResetByTokenHash(targetTokenHash);

  if (!resetRecord || resetRecord.usedAt || new Date(resetRecord.expiresAt).getTime() <= Date.now()) {
    throw new AuthError("Password reset token is invalid or expired.", "AUTH_RESET_INVALID", 400);
  }

  const user = await repository.getUserById(resetRecord.userId);

  if (!user) {
    throw new AuthError("Password reset token is invalid.", "AUTH_RESET_INVALID", 400);
  }

  user.passwordHash = await hash(parsed.newPassword, PASSWORD_SALT_ROUNDS);
  user.passwordUpdatedAt = new Date().toISOString();
  user.updatedAt = user.passwordUpdatedAt;
  resetRecord.usedAt = new Date().toISOString();
  await repository.updateUser(user);

  const activeSessions = await repository.listSessionsByUserId(user.id);

  await Promise.all(
    activeSessions.map(async (session) => {
      session.revokedAt = new Date().toISOString();
      await repository.updateSession(session);
    }),
  );

  await repository.updatePasswordReset(resetRecord);
}
