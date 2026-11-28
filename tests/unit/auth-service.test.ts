import { compare } from "bcryptjs";
import { vi } from "vitest";

import {
  confirmPasswordReset,
  listMembers,
  loginUser,
  refreshUserSession,
  registerUser,
  requestPasswordReset,
  setEmail,
} from "@/src/modules/identity/application/auth-service";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import type { UserRole } from "@/src/modules/identity/domain/auth-types";
import {
  getAuthStore,
  getMemoryAuthRepository,
  resetAuthStoreForTesting,
} from "@/src/modules/identity/infrastructure/auth-store";
import {
  getLastNotificationMessageForTesting,
  resetLogNotificationChannelForTesting,
} from "@/src/modules/platform/infrastructure/log-notification-channel";

describe("auth service", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetLogNotificationChannelForTesting();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
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

  it("stores an optional email captured at registration", async () => {
    const result = await registerUser({
      phoneNumber: "01712345678",
      displayName: "Ahsan Habib",
      password: "Okkhor2026",
      locale: "bn-BD",
      roles: ["learner"],
      email: "member@example.com",
    });

    expect(result.user.email).toBe("member@example.com");
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

  it("issues a 6-digit code and delivers it through the log channel", async () => {
    await registerUser({
      phoneNumber: "01712345678",
      displayName: "Ahsan Habib",
      password: "Okkhor2026",
      locale: "bn-BD",
      roles: ["learner"],
    });

    const result = await requestPasswordReset({ phoneNumber: "01712345678" });

    expect(result.accepted).toBe(true);
    expect(result.resetTokenPreview).toMatch(/^\d{6}$/);
    expect(result.expiresAt).toBeTruthy();

    const delivered = getLastNotificationMessageForTesting();

    expect(delivered?.destination.phoneNumber).toBe("+8801712345678");
    expect(delivered?.body).toContain(String(result.resetTokenPreview));
  });

  it("keeps the neutral response and sends nothing for an unknown account", async () => {
    const result = await requestPasswordReset({ phoneNumber: "01712345678" });

    expect(result).toEqual({
      accepted: true,
      message: expect.stringContaining("If the account exists"),
    });
    expect(result.resetTokenPreview).toBeUndefined();
    expect(getLastNotificationMessageForTesting()).toBeUndefined();
  });

  it("swallows a channel failure without changing the neutral response", async () => {
    await registerUser({
      phoneNumber: "01712345678",
      displayName: "Ahsan Habib",
      password: "Okkhor2026",
      locale: "bn-BD",
      roles: ["learner"],
    });
    vi.stubEnv("NOTIFICATION_CHANNEL_DRIVER", "sms");
    vi.stubEnv("NOTIFICATION_SMS_WEBHOOK_URL", "https://sms.example/send");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await requestPasswordReset({ phoneNumber: "01712345678" });

    expect(result.accepted).toBe(true);
    // A non-log channel never surfaces the code, even when its send fails.
    expect(result.resetTokenPreview).toBeUndefined();
  });

  it("rejects an unknown reset code", async () => {
    await registerUser({
      phoneNumber: "01712345678",
      displayName: "Ahsan Habib",
      password: "Okkhor2026",
      locale: "bn-BD",
      roles: ["learner"],
    });

    await expect(
      confirmPasswordReset({ token: "000000", newPassword: "Okkhor3030" }),
    ).rejects.toMatchObject({ code: "AUTH_RESET_INVALID", status: 400 });
  });

  it("sets and clears the owner's email", async () => {
    const { user } = await registerUser({
      phoneNumber: "01712345678",
      displayName: "Ahsan Habib",
      password: "Okkhor2026",
      locale: "bn-BD",
      roles: ["learner"],
    });

    const withEmail = await setEmail({ id: user.id }, { email: "member@example.com" });
    expect(withEmail.email).toBe("member@example.com");

    const cleared = await setEmail({ id: user.id }, { email: "" });
    expect(cleared.email).toBeUndefined();
  });

  it("rejects an invalid email on setEmail", async () => {
    const { user } = await registerUser({
      phoneNumber: "01712345678",
      displayName: "Ahsan Habib",
      password: "Okkhor2026",
      locale: "bn-BD",
      roles: ["learner"],
    });

    await expect(setEmail({ id: user.id }, { email: "not-an-email" })).rejects.toMatchObject({
      code: "AUTH_VALIDATION_FAILED",
      status: 400,
    });
  });
});

async function seedMember(
  id: string,
  displayName: string,
  createdAt: string,
  roles: UserRole[] = ["learner"],
  lastLoginAt?: string,
) {
  await getMemoryAuthRepository().createUser({
    id,
    phoneNumber: `+8801${id}`,
    displayName,
    locale: "bn-BD",
    roles,
    createdAt,
    updatedAt: createdAt,
    passwordUpdatedAt: createdAt,
    passwordHash: "seeded-hash",
    lastLoginAt,
  });
}

describe("listMembers", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
  });

  it("refuses a non-administrator", async () => {
    await expect(listMembers({ id: "u-1", roles: ["scholar"] })).rejects.toMatchObject({
      code: "AUTH_FORBIDDEN",
      status: 403,
    });
  });

  it("returns every member newest first, projected without contact points", async () => {
    await seedMember("m-old", "Earlier Member", "2026-01-05T00:00:00.000Z", ["learner"]);
    await seedMember("m-new", "Later Member", "2026-02-10T00:00:00.000Z", ["scholar"], "2026-03-01T00:00:00.000Z");

    const roster = await listMembers({ id: "u-admin", roles: ["admin"] });

    expect(roster.map((entry) => entry.displayName)).toEqual(["Later Member", "Earlier Member"]);

    const [newest] = roster;
    expect(newest.roles).toEqual(["scholar"]);
    expect(newest.createdAt).toBe("2026-02-10T00:00:00.000Z");
    expect(newest.lastLoginAt).toBe("2026-03-01T00:00:00.000Z");
    // The projection carries no phone number, email, or password metadata.
    expect(Object.keys(newest).sort()).toEqual(["createdAt", "displayName", "id", "lastLoginAt", "roles"]);
    expect((newest as Record<string, unknown>).phoneNumber).toBeUndefined();
    expect((newest as Record<string, unknown>).email).toBeUndefined();
  });
});
