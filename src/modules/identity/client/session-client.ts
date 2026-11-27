"use client";

import type { UserProfile } from "@/src/modules/identity/domain/auth-types";

export type SessionPayload = {
  user: UserProfile;
  sessionId: string;
};

type ApiErrorShape = {
  error?: {
    message?: string;
  };
};

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function fetchSession(): Promise<SessionPayload> {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await parseJson<ApiErrorShape>(response).catch(() => undefined);
    throw new Error(payload?.error?.message || "Session lookup failed.");
  }

  return parseJson<SessionPayload>(response);
}

export async function refreshSession(): Promise<boolean> {
  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
  });

  return response.ok;
}

export async function ensureSession(): Promise<SessionPayload> {
  try {
    return await fetchSession();
  } catch {
    const refreshed = await refreshSession();

    if (!refreshed) {
      throw new Error("Session refresh failed.");
    }

    return fetchSession();
  }
}

export async function logoutSession() {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
}

export function getUserInitials(displayName: string) {
  const tokens = displayName
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 2);

  return tokens.map((token) => token[0]?.toUpperCase() || "").join("") || "OK";
}
