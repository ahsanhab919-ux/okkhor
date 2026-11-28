import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import ContentDetailPage from "@/app/content/[id]/page";
import ContentListPage from "@/app/content/page";
import type { ResearchItem } from "@/src/modules/content/domain/content-types";
import {
  getMemoryContentRepository,
  resetContentStoreForTesting,
} from "@/src/modules/content/infrastructure/content-store";
import { resetLibraryStoreForTesting } from "@/src/modules/library/infrastructure/library-store";

const cookieState = vi.hoisted(() => ({ accessToken: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieState.accessToken ? { name, value: cookieState.accessToken } : undefined),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/content/a",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

function publishedItem(overrides: Partial<ResearchItem> & { id: string }): ResearchItem {
  return {
    title: "Sediment cores reveal rapid shifts",
    abstract: "Abstract body",
    summaryBn: "বাংলা সারসংক্ষেপ নমুনা",
    sourceLanguage: "en",
    tags: ["climate"],
    status: "published",
    publishedAt: "2026-02-10T00:00:00.000Z",
    createdAt: "2026-02-10T00:00:00.000Z",
    updatedAt: "2026-02-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("content pages", () => {
  beforeEach(() => {
    resetContentStoreForTesting();
    resetLibraryStoreForTesting();
    cookieState.accessToken = undefined;
  });

  it("renders the list page with published items fetched on the server", async () => {
    await getMemoryContentRepository().createItem(publishedItem({ id: "a" }));

    render(await ContentListPage());

    expect(screen.getByRole("heading", { name: /Research Archive/i })).toBeInTheDocument();
    expect(screen.getByText("Sediment cores reveal rapid shifts")).toBeInTheDocument();
  });

  it("renders title, abstract, and Bangla summary on the detail page", async () => {
    await getMemoryContentRepository().createItem(publishedItem({ id: "a" }));

    render(await ContentDetailPage({ params: Promise.resolve({ id: "a" }) }));

    expect(screen.getByRole("heading", { name: "Sediment cores reveal rapid shifts" })).toBeInTheDocument();
    expect(screen.getByText("Abstract body")).toBeInTheDocument();
    expect(screen.getByText("বাংলা সারসংক্ষেপ নমুনা")).toBeInTheDocument();
  });

  it("offers sign-in to save for an anonymous reader on the detail page", async () => {
    await getMemoryContentRepository().createItem(publishedItem({ id: "a" }));

    render(await ContentDetailPage({ params: Promise.resolve({ id: "a" }) }));

    expect(screen.getByRole("link", { name: /Sign in to save/i })).toBeInTheDocument();
  });

  it("calls notFound for an unpublished or unknown id", async () => {
    await expect(ContentDetailPage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
