import { compare } from "bcryptjs";

import {
  confirmPasswordReset,
  loginUser,
  refreshUserSession,
  registerUser,
  requestPasswordReset,
} from "@/src/modules/identity/application/auth-service";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import { getAuthStore, resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";

describe("auth service", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
  });

  it("registers a user, hashes the password, and returns session tokens", async () => {
    const result = await registerUser({
      phoneNumber: "01712345678",
      displayName: "Ahsan Habib",
      password: "Okkhor2026",
      locale: "bn-BD",
      roles: ["learner"],
    });

    expect(result.user.phoneNumber).toBe("+8801712345678");
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();

    const store = getAuthStore();
    const storedUser = Array.from(store.usersById.values())[0];

    expect(storedUser.passwordHash).not.toBe("Okkhor2026");
    expect(await compare("Okkhor2026", storedUser.passwordHash)).toBe(true);
  });

  it("rejects invalid credentials", async () => {
    await registerUser({
      phoneNumber: "01712345678",
      displayName: "Ahsan Habib",
      password: "Okkhor2026",
      locale: "bn-BD",
      roles: ["learner"],
    });

    await expect(
      loginUser({
        phoneNumber: "01712345678",
        password: "WrongPassword1",
      }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("rotates refresh sessions", async () => {
    const registration = await registerUser({
      phoneNumber: "01712345678",
      displayName: "Ahsan Habib",
      password: "Okkhor2026",
      locale: "bn-BD",
      roles: ["learner"],
    });

    const refreshed = await refreshUserSession(registration.tokens.refreshToken);

    expect(refreshed.tokens.refreshToken).not.toBe(registration.tokens.refreshToken);

    const sessions = Array.from(getAuthStore().sessionsById.values());
    expect(sessions.some((session) => session.revokedAt)).toBe(true);
  });

  it("resets password and invalidates existing sessions", async () => {
    await registerUser({
      phoneNumber: "01712345678",
      displayName: "Ahsan Habib",
      password: "Okkhor2026",
      locale: "bn-BD",
      roles: ["learner"],
    });

    const resetRequest = await requestPasswordReset({
      phoneNumber: "01712345678",
    });

    await confirmPasswordReset({
      token: String(resetRequest.resetTokenPreview),
      newPassword: "Okkhor3030",
    });

    await expect(
      loginUser({
        phoneNumber: "01712345678",
        password: "Okkhor2026",
      }),
    ).rejects.toBeInstanceOf(AuthError);

    const login = await loginUser({
      phoneNumber: "01712345678",
      password: "Okkhor3030",
    });

    expect(login.user.displayName).toBe("Ahsan Habib");
  });
});
