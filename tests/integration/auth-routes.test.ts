import { NextRequest } from "next/server";
import { vi } from "vitest";

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import { AUTH_RATE_LIMITS } from "@/src/modules/identity/application/auth-rate-limit";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";
import { resetEphemeralStoreForTesting } from "@/src/modules/platform/infrastructure/ephemeral-store";
import {
  getLastNotificationMessageForTesting,
  resetLogNotificationChannelForTesting,
} from "@/src/modules/platform/infrastructure/log-notification-channel";

import { POST as confirmReset } from "@/app/api/auth/password-reset/confirm/route";
import { POST as requestReset } from "@/app/api/auth/password-reset/request/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { PATCH as updateProfile } from "@/app/api/auth/profile/route";
import { POST as refresh } from "@/app/api/auth/refresh/route";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as session } from "@/app/api/auth/session/route";

function applyCookies(request: NextRequest, cookie?: string) {
  if (cookie) {
    const [name, value] = cookie.split("=");
    request.cookies.set(name, value);
  }

  return request;
}

function jsonRequest(url: string, body: unknown, cookie?: string) {
  return applyCookies(
    new NextRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    cookie,
  );
}

function patchRequest(url: string, body: unknown, cookie?: string) {
  return applyCookies(
    new NextRequest(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    cookie,
  );
}

describe("auth routes", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetEphemeralStoreForTesting();
    resetLogNotificationChannelForTesting();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("registers, returns cookies, and exposes the session endpoint", async () => {
    const registerResponse = await register(
      jsonRequest("http://localhost/api/auth/register", {
        phoneNumber: "01712345678",
        displayName: "Ahsan Habib",
        password: "Okkhor2026",
        locale: "bn-BD",
        roles: ["learner"],
      }),
    );

    expect(registerResponse.status).toBe(200);

    const accessCookie = registerResponse.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
    const refreshCookie = registerResponse.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

    expect(accessCookie).toBeTruthy();
    expect(refreshCookie).toBeTruthy();

    const sessionRequest = new NextRequest("http://localhost/api/auth/session");
    sessionRequest.cookies.set(ACCESS_TOKEN_COOKIE, String(accessCookie));
    const sessionResponse = await session(sessionRequest);

    const sessionPayload = (await sessionResponse.json()) as {
      user: { phoneNumber: string };
    };

    expect(sessionResponse.status).toBe(200);
    expect(sessionPayload.user.phoneNumber).toBe("+8801712345678");
  });

  it("logs in, refreshes the session, and logs out", async () => {
    await register(
      jsonRequest("http://localhost/api/auth/register", {
        phoneNumber: "01712345678",
        displayName: "Ahsan Habib",
        password: "Okkhor2026",
        locale: "bn-BD",
        roles: ["learner"],
      }),
    );

    const loginResponse = await login(
      jsonRequest("http://localhost/api/auth/login", {
        phoneNumber: "01712345678",
        password: "Okkhor2026",
      }),
    );

    const refreshCookie = loginResponse.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
    expect(refreshCookie).toBeTruthy();

    const refreshRequest = new NextRequest("http://localhost/api/auth/refresh", {
      method: "POST",
    });
    refreshRequest.cookies.set(REFRESH_TOKEN_COOKIE, String(refreshCookie));
    const refreshResponse = await refresh(refreshRequest);

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.cookies.get(REFRESH_TOKEN_COOKIE)?.value).not.toBe(refreshCookie);

    const logoutRequest = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
    });
    logoutRequest.cookies.set(REFRESH_TOKEN_COOKIE, String(refreshResponse.cookies.get(REFRESH_TOKEN_COOKIE)?.value));
    const logoutResponse = await logout(logoutRequest);

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.cookies.get(ACCESS_TOKEN_COOKIE)?.value).toBe("");
  });

  it("delivers the reset code through the log channel and confirms with it", async () => {
    await register(
      jsonRequest("http://localhost/api/auth/register", {
        phoneNumber: "01712345678",
        displayName: "Ahsan Habib",
        password: "Okkhor2026",
        locale: "bn-BD",
        roles: ["learner"],
      }),
    );

    const requestResponse = await requestReset(
      jsonRequest("http://localhost/api/auth/password-reset/request", {
        phoneNumber: "01712345678",
      }),
    );

    const requestPayload = (await requestResponse.json()) as {
      accepted: boolean;
      resetTokenPreview: string;
    };

    expect(requestResponse.status).toBe(200);
    expect(requestPayload.accepted).toBe(true);
    expect(requestPayload.resetTokenPreview).toMatch(/^\d{6}$/);
    expect(getLastNotificationMessageForTesting()?.body).toContain(requestPayload.resetTokenPreview);

    const confirmResponse = await confirmReset(
      jsonRequest("http://localhost/api/auth/password-reset/confirm", {
        token: requestPayload.resetTokenPreview,
        newPassword: "Okkhor3030",
      }),
    );

    expect(confirmResponse.status).toBe(200);
  });

  it("never returns the reset code in the response under a real channel", async () => {
    await register(
      jsonRequest("http://localhost/api/auth/register", {
        phoneNumber: "01712345678",
        displayName: "Ahsan Habib",
        password: "Okkhor2026",
        locale: "bn-BD",
        roles: ["learner"],
      }),
    );
    vi.stubEnv("NOTIFICATION_CHANNEL_DRIVER", "sms");
    vi.stubEnv("NOTIFICATION_SMS_WEBHOOK_URL", "https://sms.example/send");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));

    const requestResponse = await requestReset(
      jsonRequest("http://localhost/api/auth/password-reset/request", {
        phoneNumber: "01712345678",
      }),
    );

    const payload = (await requestResponse.json()) as {
      accepted: boolean;
      resetTokenPreview?: string;
    };

    expect(payload.accepted).toBe(true);
    expect(payload.resetTokenPreview).toBeUndefined();
  });

  it("rate limits repeated login attempts from the same client", async () => {
    const { limit } = AUTH_RATE_LIMITS.login;

    for (let attempt = 0; attempt < limit; attempt += 1) {
      const response = await login(
        jsonRequest("http://localhost/api/auth/login", {
          phoneNumber: "01712345678",
          password: "Okkhor2026",
        }),
      );

      expect(response.status).not.toBe(429);
    }

    const blockedResponse = await login(
      jsonRequest("http://localhost/api/auth/login", {
        phoneNumber: "01712345678",
        password: "Okkhor2026",
      }),
    );

    const blockedPayload = (await blockedResponse.json()) as {
      error: { code: string };
    };

    expect(blockedResponse.status).toBe(429);
    expect(blockedPayload.error.code).toBe("AUTH_RATE_LIMITED");
  });

  it("rate limits the reset confirm endpoint", async () => {
    const { limit } = AUTH_RATE_LIMITS.passwordResetConfirm;

    for (let attempt = 0; attempt < limit; attempt += 1) {
      const response = await confirmReset(
        jsonRequest("http://localhost/api/auth/password-reset/confirm", {
          token: "000000",
          newPassword: "Okkhor3030",
        }),
      );

      expect(response.status).not.toBe(429);
    }

    const blockedResponse = await confirmReset(
      jsonRequest("http://localhost/api/auth/password-reset/confirm", {
        token: "000000",
        newPassword: "Okkhor3030",
      }),
    );

    const blockedPayload = (await blockedResponse.json()) as {
      error: { code: string };
    };

    expect(blockedResponse.status).toBe(429);
    expect(blockedPayload.error.code).toBe("AUTH_RATE_LIMITED");
  });

  it("sets and clears the owner's account email through the profile endpoint", async () => {
    const registerResponse = await register(
      jsonRequest("http://localhost/api/auth/register", {
        phoneNumber: "01712345678",
        displayName: "Ahsan Habib",
        password: "Okkhor2026",
        locale: "bn-BD",
        roles: ["learner"],
        email: "member@example.com",
      }),
    );

    const accessCookie = `${ACCESS_TOKEN_COOKIE}=${registerResponse.cookies.get(ACCESS_TOKEN_COOKIE)?.value}`;

    const setResponse = await updateProfile(
      patchRequest("http://localhost/api/auth/profile", { email: "new@example.com" }, accessCookie),
    );
    const setPayload = (await setResponse.json()) as { user: { email?: string } };

    expect(setResponse.status).toBe(200);
    expect(setPayload.user.email).toBe("new@example.com");

    const clearResponse = await updateProfile(
      patchRequest("http://localhost/api/auth/profile", { email: "" }, accessCookie),
    );
    const clearPayload = (await clearResponse.json()) as { user: { email?: string } };

    expect(clearResponse.status).toBe(200);
    expect(clearPayload.user.email).toBeUndefined();
  });

  it("rejects an unauthenticated profile update", async () => {
    const response = await updateProfile(
      patchRequest("http://localhost/api/auth/profile", { email: "member@example.com" }),
    );

    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("AUTH_UNAUTHORIZED");
  });

  it("rejects a malformed email on the profile endpoint", async () => {
    const registerResponse = await register(
      jsonRequest("http://localhost/api/auth/register", {
        phoneNumber: "01712345678",
        displayName: "Ahsan Habib",
        password: "Okkhor2026",
        locale: "bn-BD",
        roles: ["learner"],
      }),
    );

    const accessCookie = `${ACCESS_TOKEN_COOKIE}=${registerResponse.cookies.get(ACCESS_TOKEN_COOKIE)?.value}`;

    const response = await updateProfile(
      patchRequest("http://localhost/api/auth/profile", { email: "not-an-email" }, accessCookie),
    );

    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("AUTH_VALIDATION_FAILED");
  });
});
