import React from "react";
import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import AdminContentPage from "@/app/admin/content/page";
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
  usePathname: () => "/admin/content",
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

type SeedItemOptions = {
  title: string;
  status: ResearchItemStatus;
  tags?: string[];
  summaryBn?: string;
  sourceLanguage?: string;
  updatedAt?: string;
};

async function seedItem(id: string, options: SeedItemOptions) {
  const updatedAt = options.updatedAt ?? "2026-02-10T00:00:00.000Z";

  await getMemoryContentRepository().createItem({
    id,
    title: options.title,
    abstract: "Abstract body",
    summaryBn: options.summaryBn ?? "",
    sourceLanguage: options.sourceLanguage ?? "en",
    tags: options.tags ?? [],
    status: options.status,
    publishedAt: options.status === "published" ? updatedAt : undefined,
    createdAt: updatedAt,
    updatedAt,
  } satisfies ResearchItem);
}

/** The register row whose first cell is this title. */
function contentRow(title: string): HTMLElement {
  const row = Array.from(document.querySelectorAll(".roster-table tbody tr")).find(
    (element) => element.querySelector("td")?.textContent?.trim() === title,
  );

  if (!row) {
    throw new Error(`No register row for ${title}`);
  }

  return row as HTMLElement;
}

function registerTitles(): string[] {
  return Array.from(document.querySelectorAll(".roster-table tbody tr")).map(
    (row) => row.querySelector("td")?.textContent?.trim() ?? "",
  );
}

function figureValue(label: string): string | undefined {
  const card = Array.from(document.querySelectorAll(".stat-card")).find(
    (element) => element.querySelector("span")?.textContent === label,
  );

  return card?.querySelector("strong")?.textContent ?? undefined;
}

async function renderRegister(status?: string) {
  return render(await AdminContentPage({ searchParams: Promise.resolve({ status }) }));
}

describe("admin content register page", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetContentStoreForTesting();
    cookieState.accessToken = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the restricted screen for a non-administrator", async () => {
    await signInAs(["learner"]);

    await renderRegister();

    expect(await screen.findByText(/Administrator access required/i)).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Filter content" })).toBeNull();
  });

  it("lists every item with its classification, status, and summary state", async () => {
    await signInAs(["admin"]);

    await seedItem("c1", {
      title: "Lothal excavation record",
      status: "published",
      tags: ["archaeology", "history"],
      summaryBn: "বাংলা সারসংক্ষেপ",
      sourceLanguage: "en",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    await seedItem("c2", {
      title: "Monsoon hydrology draft",
      status: "draft",
      sourceLanguage: "bn",
      updatedAt: "2026-03-02T00:00:00.000Z",
    });

    await renderRegister();

    expect(await screen.findByText(/Every research item in the archive/i)).toBeInTheDocument();

    const publishedRow = contentRow("Lothal excavation record");
    expect(within(publishedRow).getByText("archaeology")).toBeInTheDocument();
    expect(within(publishedRow).getByText("history")).toBeInTheDocument();
    expect(within(publishedRow).getByText("published")).toBeInTheDocument();
    expect(within(publishedRow).getByText("Present")).toBeInTheDocument();
    // A published item links to its public read page; the item's source language is shown.
    expect(within(publishedRow).getByRole("link", { name: "Lothal excavation record" })).toHaveAttribute(
      "href",
      "/content/c1",
    );
    expect(within(publishedRow).getByText("en")).toBeInTheDocument();

    // A draft carries no summary, is not linked, and is tagged with no classification.
    const draftRow = contentRow("Monsoon hydrology draft");
    expect(within(draftRow).getByText("draft")).toBeInTheDocument();
    expect(within(draftRow).getByText("Missing")).toBeInTheDocument();
    expect(within(draftRow).getByText("None")).toBeInTheDocument();
    expect(within(draftRow).queryByRole("link")).toBeNull();

    expect(figureValue("Items")).toBe("2");
    expect(figureValue("Published")).toBe("1");
    expect(figureValue("Drafts")).toBe("1");
    expect(figureValue("Missing summary")).toBe("0");
  });

  it("filters the register to drafts", async () => {
    await signInAs(["admin"]);

    await seedItem("c1", { title: "Lothal excavation record", status: "published", summaryBn: "বাংলা" });
    await seedItem("c2", { title: "Monsoon hydrology draft", status: "draft" });

    await renderRegister("draft");

    expect(await screen.findByText("Monsoon hydrology draft")).toBeInTheDocument();
    expect(registerTitles()).toEqual(["Monsoon hydrology draft"]);

    const filterNav = screen.getByRole("navigation", { name: "Filter content" });
    expect(within(filterNav).getByRole("link", { name: "Drafts" })).toHaveClass("tab-row__tab--active");
  });

  it("explains an empty register", async () => {
    await signInAs(["admin"]);

    await renderRegister();

    expect(await screen.findByText("No research items have been registered yet.")).toBeInTheDocument();
  });
});
