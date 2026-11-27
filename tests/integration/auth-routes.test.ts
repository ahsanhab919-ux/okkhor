import { NextRequest } from "next/server";

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";

import { POST as confirmReset } from "@/app/api/auth/password-reset/confirm/route";
import { POST as requestReset } from "@/app/api/auth/password-reset/request/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as refresh } from "@/app/api/auth/refresh/route";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as session } from "@/app/api/auth/session/route";

function jsonRequest(url: string, body: unknown, cookie?: string) {
  const request = new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (cookie) {
    const [name, value] = cookie.split("=");
    request.cookies.set(name, value);
  }

  return request;
}

describe("auth routes", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
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

  it("supports password reset request and confirmation", async () => {
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
      resetTokenPreview: string;
    };

    expect(requestResponse.status).toBe(200);
    expect(requestPayload.resetTokenPreview).toBeTruthy();

    const confirmResponse = await confirmReset(
      jsonRequest("http://localhost/api/auth/password-reset/confirm", {
        token: requestPayload.resetTokenPreview,
        newPassword: "Okkhor3030",
      }),
    );

    expect(confirmResponse.status).toBe(200);
  });
});
