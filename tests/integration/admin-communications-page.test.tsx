import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import AdminCommunicationsPage from "@/app/admin/communications/page";
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
  usePathname: () => "/admin/communications",
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

async function renderCommunications() {
  return render(await AdminCommunicationsPage());
}

describe("admin communications page", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    cookieState.accessToken = undefined;

    // A deterministic baseline: an unset driver resolves to `auto`, and no gateway is configured.
    vi.stubEnv("NOTIFICATION_CHANNEL_DRIVER", "");
    vi.stubEnv("NOTIFICATION_SMS_WEBHOOK_URL", "");
    vi.stubEnv("NOTIFICATION_EMAIL_WEBHOOK_URL", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("renders the restricted screen for a non-administrator", async () => {
    await signInAs(["learner"]);

    await renderCommunications();

    expect(await screen.findByText(/Administrator access required/i)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Delivery channels" })).toBeNull();
  });

  it("reports the resolved delivery channels, read-only", async () => {
    await signInAs(["admin"]);

    await renderCommunications();

    const delivery = await screen.findByRole("region", { name: "Delivery channels" });
    expect(configValue(delivery, "Driver")).toBe("Auto");
    // Under test, `auto` resolves to the deterministic log channel.
    expect(configValue(delivery, "Resolved channels")).toBe("Log");
    expect(configValue(delivery, "Channel count")).toBe("1");
    expect(configValue(delivery, "SMS gateway")).toBe("Not set");
    expect(configValue(delivery, "Email gateway")).toBe("Not set");

    // Nothing here is composable or sendable, and the page says so.
    expect(screen.getByText(/This surface is read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Console" })).toHaveAttribute("href", "/admin");
  });

  it("reports the environment override when the driver forces both gateways", async () => {
    await signInAs(["admin"]);

    vi.stubEnv("NOTIFICATION_CHANNEL_DRIVER", "sms+email");
    vi.stubEnv("NOTIFICATION_SMS_WEBHOOK_URL", "https://sms.example.test");
    vi.stubEnv("NOTIFICATION_EMAIL_WEBHOOK_URL", "https://email.example.test");

    await renderCommunications();

    const delivery = await screen.findByRole("region", { name: "Delivery channels" });
    expect(configValue(delivery, "Driver")).toBe("SMS and email");
    expect(configValue(delivery, "Resolved channels")).toBe("SMS, Email");
    expect(configValue(delivery, "Channel count")).toBe("2");
    expect(configValue(delivery, "SMS gateway")).toBe("Configured");
    expect(configValue(delivery, "Email gateway")).toBe("Configured");
  });

  it("describes every outcome the platform sends members", async () => {
    await signInAs(["admin"]);

    await renderCommunications();

    const outcomes = await screen.findByRole("region", { name: "Member outcomes" });
    for (const label of [
      "Content hidden",
      "Report resolved",
      "Report dismissed",
      "New reply",
      "Verification approved",
      "Verification rejected",
    ]) {
      expect(outcomes).toHaveTextContent(label);
    }
  });
});
