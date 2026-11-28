import { createHash, randomUUID } from "node:crypto";

import { compare, hash } from "bcryptjs";
import { ZodError } from "zod";

import {
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  PASSWORD_RESET_MAX_AGE_SECONDS,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
} from "@/src/modules/identity/domain/auth-config";
import { generatePasswordResetCode } from "@/src/modules/identity/domain/auth-codes";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from "@/src/modules/identity/domain/auth-jwt";
import {
  type LoginInput,
  loginSchema,
  type PasswordResetConfirmInput,
  passwordResetConfirmSchema,
  type PasswordResetRequestInput,
  passwordResetRequestSchema,
  type ProfileEmailUpdateInput,
  profileEmailUpdateSchema,
  type RegistrationInput,
  registrationSchema,
} from "@/src/modules/identity/domain/auth-schemas";
import type {
  AuthSessionRecord,
  AuthSuccess,
  MemberRosterEntry,
  PasswordResetRecord,
  PublicProfile,
  UserProfile,
  UserProfileLabel,
  UserRecord,
  UserRole,
} from "@/src/modules/identity/domain/auth-types";
import { getAuthRepository } from "@/src/modules/identity/infrastructure/auth-repository";
import type { NotificationChannel, NotificationDestination, NotificationMessage } from "@/src/modules/platform/domain/notification-types";
import { getNotificationChannels } from "@/src/modules/platform/infrastructure/notification-channel";

const PASSWORD_SALT_ROUNDS = 12;

function toIsoDate(secondsFromNow: number) {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString();
}

function hashOpaqueToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Sends a message through every resolved channel, isolating failures: a failing channel is logged
 * and never thrown, so it cannot stop another channel and never changes the caller's response
 * (`password-reset-delivery-slice.md` §7, §9).
 */
async function deliverNotification(channels: NotificationChannel[], message: NotificationMessage) {
  if (channels.length === 0) {
    console.error("[notification] No delivery channel is configured; the message was not sent.");
    return;
  }

  await Promise.all(
    channels.map(async (channel) => {
      try {
        await channel.send(message);
      } catch (error) {
        console.error(`[notification] ${channel.kind} delivery failed.`, error);
      }
    }),
  );
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
    email: parsed.email,
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

/**
 * Grants a role to a user through identity's public surface (see
 * `scholar-verification-slice.md` §5.1). Only an administrator may grant a role, and the check
 * is re-applied here so the privilege decision never rests solely on the caller. Idempotent —
 * adding a role the user already holds is a no-op.
 */
export async function grantUserRole(
  actor: { id: string; roles: UserRole[] },
  userId: string,
  role: UserRole,
): Promise<UserProfile> {
  if (!actor.roles.includes("admin")) {
    throw new AuthError("Only administrators can grant roles.", "AUTH_FORBIDDEN", 403);
  }

  const repository = getAuthRepository();
  const user = await repository.getUserById(userId);

  if (!user) {
    throw new AuthError("Authenticated user no longer exists.", "AUTH_UNAUTHORIZED", 401);
  }

  if (!user.roles.includes(role)) {
    user.roles = [...user.roles, role];
    user.updatedAt = new Date().toISOString();
    await repository.updateUser(user);
  }

  return sanitizeUser(user);
}

/**
 * Resolves display labels for a set of user ids through identity's public surface. Used by the
 * composition root to label authors in search results; the search module never resolves names.
 */
export async function getUserProfilesByIds(ids: string[]): Promise<UserProfileLabel[]> {
  const uniqueIds = Array.from(new Set(ids));

  return getAuthRepository().listProfilesByIds(uniqueIds);
}

/**
 * Resolves the public footprint of a member through identity's public surface, or `undefined`
 * when no such member exists. Returns only the `PublicProfile` view — never the phone number or
 * password metadata — so the profile pages cannot leak sensitive fields
 * (`member-profile-slice.md` §5, §7).
 */
export async function getPublicProfile(id: string): Promise<PublicProfile | undefined> {
  const user = await getAuthRepository().getUserById(id);

  if (!user) {
    return undefined;
  }

  return {
    id: user.id,
    displayName: user.displayName,
    roles: user.roles,
    createdAt: user.createdAt,
  };
}

/**
 * The administrator roster: every member, newest first, projected to the fields an administrator
 * needs (`MemberRosterEntry`) — never the phone number, email, or password metadata. Only an
 * administrator may read it, and the check is re-applied here so the privilege decision never
 * rests solely on the caller (`grantUserRole`'s rule, `module-boundaries.md` §7).
 */
export async function listMembers(actor: { id: string; roles: UserRole[] }): Promise<MemberRosterEntry[]> {
  if (!actor.roles.includes("admin")) {
    throw new AuthError("Only administrators can list members.", "AUTH_FORBIDDEN", 403);
  }

  const users = await getAuthRepository().listUsers();

  return users.map((user) => ({
    id: user.id,
    displayName: user.displayName,
    roles: user.roles,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  }));
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

const PASSWORD_RESET_NEUTRAL_MESSAGE = "If the account exists, a reset instruction has been issued.";

/**
 * The neutral reset-request response. `resetTokenPreview`/`expiresAt` are present only under the
 * dev/test `log` channel outside production; they are absent for real deliveries and in production
 * (`password-reset-delivery-slice.md` §6).
 */
export type PasswordResetRequestResult = {
  accepted: true;
  message: string;
  resetTokenPreview?: string;
  expiresAt?: string;
};

/**
 * Issues a password-reset code and delivers it through the configured channels. The response is
 * identical whether the account exists, the delivery failed, or the send succeeded, so it cannot
 * be used to test account existence (`password-reset-delivery-slice.md` §7). The code itself is
 * returned only under the dev/test `log` channel outside production (§6).
 */
export async function requestPasswordReset(input: PasswordResetRequestInput): Promise<PasswordResetRequestResult> {
  const parsed = parseSchema(passwordResetRequestSchema, input);
  const user = await getUserByPhone(parsed.phoneNumber);

  if (!user) {
    return {
      accepted: true,
      message: PASSWORD_RESET_NEUTRAL_MESSAGE,
    };
  }

  const code = generatePasswordResetCode();
  const record: PasswordResetRecord = {
    id: randomUUID(),
    userId: user.id,
    tokenHash: hashOpaqueToken(code),
    createdAt: new Date().toISOString(),
    expiresAt: toIsoDate(PASSWORD_RESET_MAX_AGE_SECONDS),
  };

  await getAuthRepository().createPasswordReset(record);

  const channels = getNotificationChannels();
  const expiresInMinutes = Math.round(PASSWORD_RESET_MAX_AGE_SECONDS / 60);

  await deliverNotification(channels, {
    destination: { phoneNumber: user.phoneNumber, email: user.email },
    subject: "Your Okkhor password reset code",
    body: `Your Okkhor password reset code is ${code}. It expires in ${expiresInMinutes} minutes. If you did not request a reset, you can ignore this message.`,
  });

  const previewAllowed = process.env.NODE_ENV !== "production" && channels.some((channel) => channel.kind === "log");

  return {
    accepted: true,
    message: PASSWORD_RESET_NEUTRAL_MESSAGE,
    ...(previewAllowed ? { resetTokenPreview: code, expiresAt: record.expiresAt } : {}),
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

/**
 * Sets or clears the acting member's own email through identity's public surface. The caller
 * resolves the actor from the session, and this use case re-reads the user so the edit is always
 * scoped to the caller's own record (`password-reset-delivery-slice.md` §6, §7). An empty value
 * clears the field.
 */
export async function setEmail(actor: { id: string }, input: ProfileEmailUpdateInput): Promise<UserProfile> {
  const parsed = parseSchema(profileEmailUpdateSchema, input);
  const repository = getAuthRepository();
  const user = await repository.getUserById(actor.id);

  if (!user) {
    throw new AuthError("Authenticated user no longer exists.", "AUTH_UNAUTHORIZED", 401);
  }

  user.email = parsed.email;
  user.updatedAt = new Date().toISOString();
  await repository.updateUser(user);

  return sanitizeUser(user);
}

/**
 * Resolves a member's contact points for outbound delivery through identity's public surface, or
 * `undefined` when no such member exists. Returns **only** the two contact points — never the
 * password metadata or roles — so the composition root can pass plain delivery data to the
 * notifications module without that module reaching into identity (`notifications-slice.md` §5, §8).
 */
export async function getNotificationDestinationById(id: string): Promise<NotificationDestination | undefined> {
  const user = await getAuthRepository().getUserById(id);

  if (!user) {
    return undefined;
  }

  return { phoneNumber: user.phoneNumber, email: user.email };
}
