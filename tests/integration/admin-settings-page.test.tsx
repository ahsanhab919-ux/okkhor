import React from "react";
import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import AdminSettingsPage from "@/app/admin/settings/page";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import type { UserRole } from "@/src/modules/identity/domain/auth-types";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";

const cookieState = vi.hoisted(() => ({ accessToken: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieState.accessToken ? { name, value: cookieState.accessToken } : undefined),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/settings",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

function sessionUser(roles: UserRole[], id: string) {
  return {
    id,
    phoneNumber: "+8801712345678",
    displayName: "Ahsan Habib",
    locale: "bn-BD",
    roles,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    passwordUpdatedAt: "2026-07-18T00:00:00.000Z",
  };
}

async function signInAs(roles: UserRole[]): Promise<string> {
  const result = await registerUser({
    phoneNumber: "01712345678",
    displayName: "Ahsan Habib",
    password: "Okkhor2026",
    locale: "bn-BD",
    roles,
  });

  cookieState.accessToken = result.tokens.accessToken;

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: sessionUser(roles, result.user.id), sessionId: "sess-12345678" }), {
        status: 200,
      }),
    ),
  );

  return result.user.id;
}

/** The `dd` that answers the `dt` with this label inside a config panel. */
function configValue(panel: HTMLElement, label: string): string | undefined {
  const term = Array.from(panel.querySelectorAll("dt")).find((element) => element.textContent === label);

  return term?.parentElement?.querySelector("dd")?.textContent ?? undefined;
}

async function renderSettings() {
  return render(await AdminSettingsPage());
}

describe("admin settings page", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    cookieState.accessToken = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the restricted screen for a non-administrator", async () => {
    await signInAs(["learner"]);

    await renderSettings();

    expect(await screen.findByText(/Administrator access required/i)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Runtime" })).toBeNull();
  });

  it("reports the resolved runtime, session lifetimes, and attempt budgets, read-only", async () => {
    await signInAs(["admin"]);

    await renderSettings();

    const runtime = await screen.findByRole("region", { name: "Runtime" });
    expect(configValue(runtime, "Name")).toBe("Okkhor");
    expect(configValue(runtime, "Status")).toBe("ok");
    expect(configValue(runtime, "Architecture")).toBe("modular-monolith");
    expect(configValue(runtime, "Default locale")).toBe("bn-BD");

    const sessions = screen.getByRole("region", { name: "Sessions and access" });
    expect(configValue(sessions, "Access token")).toBe("15 minutes");
    expect(configValue(sessions, "Refresh token")).toBe("7 days");
    expect(configValue(sessions, "Password reset code")).toBe("15 minutes");

    const limits = screen.getByRole("region", { name: "Rate limiting" });
    expect(configValue(limits, "Sign in")).toBe("10 per 5 minutes");
    expect(configValue(limits, "Registration")).toBe("5 per 1 hour");
    expect(configValue(limits, "Reset request")).toBe("5 per 1 hour");
    expect(configValue(limits, "Reset confirmation")).toBe("10 per 15 minutes");

    // Nothing here is editable and nothing is persisted, and the page says so.
    expect(screen.getByText(/This surface is read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Console" })).toHaveAttribute("href", "/admin");
  });

  it("lists the platform directives the platform module declares", async () => {
    await signInAs(["admin"]);

    await renderSettings();

    const directives = await screen.findByRole("region", { name: "Platform directives" });
    expect(within(directives).getAllByRole("listitem")).toHaveLength(3);
  });
});
