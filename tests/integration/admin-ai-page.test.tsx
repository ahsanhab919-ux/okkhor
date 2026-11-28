import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import AdminAiPage from "@/app/admin/ai/page";
import type { ResearchItem, ResearchItemStatus } from "@/src/modules/content/domain/content-types";
import {
  getMemoryContentRepository,
  resetContentStoreForTesting,
} from "@/src/modules/content/infrastructure/content-store";
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
  usePathname: () => "/admin/ai",
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

async function seedItem(id: string, status: ResearchItemStatus, summaryBn: string) {
  await getMemoryContentRepository().createItem({
    id,
    title: `Item ${id}`,
    abstract: "Abstract body",
    summaryBn,
    sourceLanguage: "en",
    tags: ["climate"],
    status,
    publishedAt: status === "published" ? "2026-02-10T00:00:00.000Z" : undefined,
    createdAt: "2026-02-10T00:00:00.000Z",
    updatedAt: "2026-02-10T00:00:00.000Z",
  } satisfies ResearchItem);
}

/** The `dd` that answers the `dt` with this label inside a config panel. */
function configValue(panel: HTMLElement, label: string): string | undefined {
  const term = Array.from(panel.querySelectorAll("dt")).find((element) => element.textContent === label);

  return term?.parentElement?.querySelector("dd")?.textContent ?? undefined;
}

async function renderAi() {
  return render(await AdminAiPage());
}

describe("admin AI summarization page", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetContentStoreForTesting();
    cookieState.accessToken = undefined;

    // A deterministic baseline: an unset driver resolves to `auto`, and no key is present.
    vi.stubEnv("AI_SUMMARY_DRIVER", "");
    vi.stubEnv("GEMINI_MODEL", "");
    vi.stubEnv("AI_SUMMARY_TIMEOUT_MS", "");
    vi.stubEnv("GEMINI_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("renders the restricted screen for a non-administrator", async () => {
    await signInAs(["learner"]);

    await renderAi();

    expect(await screen.findByText(/Administrator access required/i)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Provider" })).toBeNull();
  });

  it("reports the resolved provider configuration, read-only", async () => {
    await signInAs(["admin"]);

    await renderAi();

    const provider = await screen.findByRole("region", { name: "Provider" });
    expect(configValue(provider, "Driver")).toBe("Auto");
    // Under test, `auto` resolves to the deterministic offline provider.
    expect(configValue(provider, "Resolved provider")).toBe("Offline (fake)");
    expect(configValue(provider, "Model")).toBe("gemini-2.0-flash");
    expect(configValue(provider, "Request timeout")).toBe("15 seconds");
    expect(configValue(provider, "API key")).toBe("Not set");

    // Nothing here is editable and nothing is persisted, and the page says so.
    expect(screen.getByText(/This surface is read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Console" })).toHaveAttribute("href", "/admin");
  });

  it("reports the environment override when the driver is forced to Gemini", async () => {
    await signInAs(["admin"]);

    vi.stubEnv("AI_SUMMARY_DRIVER", "gemini");
    vi.stubEnv("GEMINI_MODEL", "gemini-2.5-pro");
    vi.stubEnv("AI_SUMMARY_TIMEOUT_MS", "30000");
    vi.stubEnv("GEMINI_API_KEY", "test-key");

    await renderAi();

    const provider = await screen.findByRole("region", { name: "Provider" });
    expect(configValue(provider, "Driver")).toBe("Gemini");
    expect(configValue(provider, "Resolved provider")).toBe("Gemini");
    expect(configValue(provider, "Model")).toBe("gemini-2.5-pro");
    expect(configValue(provider, "Request timeout")).toBe("30 seconds");
    expect(configValue(provider, "API key")).toBe("Configured");
  });

  it("counts how much of the archive carries a Bangla summary", async () => {
    await signInAs(["admin"]);

    await seedItem("c1", "published", "বাংলা সারসংক্ষেপ");
    // Seeded directly through the repository: a published item that somehow carries no summary.
    await seedItem("c2", "published", "");
    await seedItem("c3", "draft", "খসড়া সারসংক্ষেপ");

    await renderAi();

    const coverage = await screen.findByRole("region", { name: "Summary coverage" });
    expect(screen.getByText("1 of 2 published items carry a Bangla summary (50%).")).toBeInTheDocument();
    expect(configValue(coverage, "Total items")).toBe("3");
    expect(configValue(coverage, "Published")).toBe("2");
    expect(configValue(coverage, "Drafts")).toBe("1");
    expect(configValue(coverage, "With Bangla summary")).toBe("1");
    expect(configValue(coverage, "Missing Bangla summary")).toBe("1");
  });
});
