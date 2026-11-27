import { jwtVerify } from "jose";
import jwt from "jsonwebtoken";

import {
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  getAuthSecret,
  getAuthSecretKey,
} from "@/src/modules/identity/domain/auth-config";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import type { AccessTokenClaims, RefreshTokenClaims, UserProfile } from "@/src/modules/identity/domain/auth-types";

export async function signAccessToken(user: UserProfile, sessionId: string) {
  return jwt.sign(
    {
      phoneNumber: user.phoneNumber,
      roles: user.roles,
      sessionId,
      type: "access",
    } satisfies Omit<AccessTokenClaims, "sub">,
    getAuthSecret(),
    {
      algorithm: "HS256",
      subject: user.id,
      expiresIn: ACCESS_TOKEN_MAX_AGE_SECONDS,
    },
  );
}

export async function signRefreshToken(userId: string, sessionId: string) {
  return jwt.sign(
    {
      sessionId,
      type: "refresh",
    } satisfies Omit<RefreshTokenClaims, "sub">,
    getAuthSecret(),
    {
      algorithm: "HS256",
      subject: userId,
      expiresIn: REFRESH_TOKEN_MAX_AGE_SECONDS,
    },
  );
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const payload = jwt.verify(token, getAuthSecret()) as jwt.JwtPayload;

    if (payload.type !== "access" || typeof payload.sub !== "string" || typeof payload.sessionId !== "string") {
      throw new AuthError("Access token is invalid.", "AUTH_TOKEN_INVALID", 401);
    }

    return {
      sub: payload.sub,
      sessionId: payload.sessionId,
      phoneNumber: String(payload.phoneNumber),
      roles: Array.isArray(payload.roles) ? (payload.roles as UserProfile["roles"]) : ["learner"],
      type: "access",
    };
  } catch {
    throw new AuthError("Access token is invalid or expired.", "AUTH_TOKEN_INVALID", 401);
  }
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenClaims> {
  try {
    const payload = jwt.verify(token, getAuthSecret()) as jwt.JwtPayload;

    if (payload.type !== "refresh" || typeof payload.sub !== "string" || typeof payload.sessionId !== "string") {
      throw new AuthError("Refresh token is invalid.", "AUTH_TOKEN_INVALID", 401);
    }

    return {
      sub: payload.sub,
      sessionId: payload.sessionId,
      type: "refresh",
    };
  } catch {
    throw new AuthError("Refresh token is invalid or expired.", "AUTH_TOKEN_INVALID", 401);
  }
}

export async function verifyAccessTokenEdge(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecretKey());

    if (payload.type !== "access" || typeof payload.sub !== "string" || typeof payload.sessionId !== "string") {
      throw new AuthError("Access token is invalid.", "AUTH_TOKEN_INVALID", 401);
    }

    return {
      sub: payload.sub,
      sessionId: payload.sessionId,
      phoneNumber: String(payload.phoneNumber),
      roles: Array.isArray(payload.roles) ? (payload.roles as UserProfile["roles"]) : ["learner"],
      type: "access",
    };
  } catch {
    throw new AuthError("Access token is invalid or expired.", "AUTH_TOKEN_INVALID", 401);
  }
}
