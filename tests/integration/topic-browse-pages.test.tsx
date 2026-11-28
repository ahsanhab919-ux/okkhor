import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import CategoryBrowsePage from "@/app/categories/[category]/page";
import CommunityThreadPage from "@/app/community/[id]/page";
import ContentDetailPage from "@/app/content/[id]/page";
import TagBrowsePage from "@/app/tags/[tag]/page";
import TopicsPage from "@/app/topics/page";
import type { ModerationState } from "@/src/modules/community/domain/community-types";
import {
  getMemoryCommunityRepository,
  resetCommunityStoreForTesting,
} from "@/src/modules/community/infrastructure/community-store";
import type { ResearchItem } from "@/src/modules/content/domain/content-types";
import {
  getMemoryContentRepository,
  resetContentStoreForTesting,
} from "@/src/modules/content/infrastructure/content-store";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";
import { resetLibraryStoreForTesting } from "@/src/modules/library/infrastructure/library-store";

const cookieState = vi.hoisted(() => ({ accessToken: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieState.accessToken ? { name, value: cookieState.accessToken } : undefined),
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/topics",
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

async function seedThread(
  id: string,
  category: string,
  title = `Thread ${id}`,
  moderationState: ModerationState = "visible",
) {
  await getMemoryCommunityRepository().createThread({
    id,
    authorId: "u-author",
    title,
    body: "A discussion body.",
    category,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    moderationState,
    locked: false,
  });
}

async function signInAs(): Promise<string> {
  const result = await registerUser({
    phoneNumber: "01712345678",
    displayName: "Ahsan Habib",
    password: "Okkhor2026",
    locale: "bn-BD",
    roles: ["learner"],
  });

  cookieState.accessToken = result.tokens.accessToken;

  return result.user.id;
}

describe("topic browse pages", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetContentStoreForTesting();
    resetCommunityStoreForTesting();
    resetLibraryStoreForTesting();
    cookieState.accessToken = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders research tag counts to everyone and prompts to sign in for categories", async () => {
    const content = getMemoryContentRepository();

    await content.createItem(publishedItem({ id: "a", tags: ["ai", "climate"] }));
    await content.createItem(publishedItem({ id: "b", tags: ["ai"] }));
    await seedThread("t1", "General");

    render(await TopicsPage());

    expect(screen.getByRole("heading", { name: "Topics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ai" })).toHaveAttribute("href", "/tags/ai");
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(screen.getByText("1 item")).toBeInTheDocument();
    // The category half is members-only: a sign-in prompt replaces it for an anonymous visitor.
    expect(screen.queryByRole("link", { name: "General" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Sign in$/ })).toHaveAttribute(
      "href",
      `/auth?next=${encodeURIComponent("/topics")}`,
    );
  });

  it("renders community category counts to a signed-in viewer", async () => {
    await signInAs();
    await seedThread("t1", "General");
    await seedThread("t2", "General");
    await seedThread("t3", "History");

    render(await TopicsPage());

    expect(screen.getByRole("link", { name: "General" })).toHaveAttribute("href", "/categories/General");
    expect(screen.getByText("2 threads")).toBeInTheDocument();
    expect(screen.getByText("1 thread")).toBeInTheDocument();
  });

  it("lists published research for a tag and shows an empty state otherwise", async () => {
    await getMemoryContentRepository().createItem(publishedItem({ id: "a", tags: ["climate"] }));

    render(await TagBrowsePage({ params: Promise.resolve({ tag: "climate" }) }));

    expect(screen.getByRole("heading", { name: "climate" })).toBeInTheDocument();
    expect(screen.getByText("Sediment cores reveal rapid shifts")).toBeInTheDocument();

    render(await TagBrowsePage({ params: Promise.resolve({ tag: "missing" }) }));

    expect(screen.getByText(/No published research carries the "missing" tag yet/i)).toBeInTheDocument();
  });

  it("lists visible threads in a category, hiding moderated ones, and shows an empty state", async () => {
    await seedThread("t1", "General", "Visible thread");
    await seedThread("t2", "General", "Hidden thread", "hidden");

    render(await CategoryBrowsePage({ params: Promise.resolve({ category: "General" }) }));

    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Visible thread" })).toHaveAttribute("href", "/community/t1");
    expect(screen.queryByText("Hidden thread")).not.toBeInTheDocument();

    render(await CategoryBrowsePage({ params: Promise.resolve({ category: "missing" }) }));

    expect(screen.getByText(/No visible discussions in the "missing" category yet/i)).toBeInTheDocument();
  });

  it("links tags on the content detail page and the category on the thread page", async () => {
    await getMemoryContentRepository().createItem(publishedItem({ id: "a", tags: ["climate", "ai"] }));

    render(await ContentDetailPage({ params: Promise.resolve({ id: "a" }) }));

    expect(screen.getByRole("link", { name: "climate" })).toHaveAttribute("href", "/tags/climate");
    expect(screen.getByRole("link", { name: "ai" })).toHaveAttribute("href", "/tags/ai");

    await seedThread("t1", "History of Science");

    render(await CommunityThreadPage({ params: Promise.resolve({ id: "t1" }) }));

    expect(screen.getByRole("link", { name: "History of Science" })).toHaveAttribute(
      "href",
      `/categories/${encodeURIComponent("History of Science")}`,
    );
  });
});
